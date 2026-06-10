import { execFile } from "node:child_process";
import { promisify } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import {
	type AdherenceResult,
	type StepResult,
	StepResult as StepResultSchema,
	type TestPlan,
} from "../types";

const execFileAsync = promisify(execFile);

/**
 * Score per ViBench semantics (paper §3.1, design D2): weighted partial
 * credit over non-bonus steps; Pass@1 only at 100%; complete failure when
 * nothing passed. Fatal-halt zeros are expected to already be present in
 * stepResults (the harness fills them).
 */
export function scoreAdherence(
	plan: TestPlan,
	stepResults: StepResult[],
): AdherenceResult {
	const byId = new Map(stepResults.map((r) => [r.stepId, r]));
	const scoring = plan.steps.filter((s) => !s.bonus);
	let earned = 0;
	let total = 0;
	let anyPass = false;
	let allPass = true;
	for (const step of scoring) {
		total += step.weight;
		const r = byId.get(step.id);
		const credit = r?.credit ?? 0;
		earned += credit * step.weight;
		if (r?.outcome === "pass") anyPass = true;
		else allPass = false;
	}
	const gradedScore = total > 0 ? (earned / total) * 100 : 0;
	return {
		gradedScore: Math.round(gradedScore * 100) / 100,
		passAt1: allPass && scoring.length > 0,
		completeFailure: !anyPass,
		stepResults,
	};
}

const EVALUATOR_SYSTEM = `You are a rigorous QA evaluator assessing whether a built implementation of the Symphony service conforms to its specification. You execute a fixed test plan against the artifact in the workspace.

Hard rules:
- NEVER repair, patch, or improve the artifact. You assess it AS-IS. If something is broken, that is a finding, not a task. (Evaluators that "helpfully" fix bugs produce invalid scores.)
- Evidence-based verdicts only: every step verdict must cite commands you ran and output you observed (cause-and-effect), never assumptions or source-reading alone. Reading source is allowed for orientation, but verdicts need observed behavior unless the check is explicitly static.
- Work like a QA engineer at a REPL: start/stop the service, mutate mock tracker state via its /control endpoints, watch logs and the filesystem, then verdict.
- Execute steps in the given order. Bounded setup: if the artifact cannot be made to run with its own setup.sh/start.sh after a few attempts, fail the fatal steps with evidence and verdict remaining functional steps as fail; still evaluate static checks where possible.
- Use 'partial' (credit between 0 and 1) when a behavior works in some required respects but not others; state exactly which respects in the evidence.

Environment provided to you:
- The artifact workspace is the current working directory.
- A mock Linear GraphQL API is running at the URL in MOCK_LINEAR_URL (control endpoints: POST /control/seed, POST /control/set-state, GET /control/requests).
- A stub coding-agent app-server binary is at STUB_APP_SERVER (JSON-line protocol; behavior modes via STUB_MODE=normal|crash|stall; logs received traffic to STUB_LOG_FILE).

Tools:
- bash: run a shell command in the workspace (persistent filesystem, non-persistent shell state — write files/scripts for anything stateful).
- record_step: record your verdict for a test-plan step (id, pass|partial|fail, credit 0-1, evidence).
Record every step exactly once. When all steps are recorded, say DONE.`;

export interface EvaluatorOptions {
	model: string;
	workspaceDir: string;
	mockLinearUrl: string;
	stubAppServerPath: string;
	maxIterations?: number;
	apiKey?: string;
	/** Called after each step verdict — checkpoint hook for crash resilience. */
	onRecord?: (r: StepResult) => void;
	/** Pre-recorded verdicts from a prior interrupted run (skipped steps). */
	preRecorded?: StepResult[];
	/** Injectable transport for tests. */
	client?: Anthropic;
}

interface BashToolInput {
	command: string;
	timeout_seconds?: number;
}

/**
 * Adaptive functional evaluator (task 6.3): a tool-augmented agent executes
 * the frozen test plan against the artifact, REPL-style, recording
 * pass/partial/fail with evidence. Fatal failures halt execution and zero
 * remaining steps (ViBench sequential-halt semantics).
 */
export async function runEvaluator(
	plan: TestPlan,
	opts: EvaluatorOptions,
): Promise<AdherenceResult> {
	const client =
		opts.client ??
		new Anthropic({ apiKey: opts.apiKey ?? process.env.ANTHROPIC_API_KEY });
	const maxIterations = opts.maxIterations ?? 400;
	const recorded = new Map<string, StepResult>(
		(opts.preRecorded ?? []).map((r) => [r.stepId, r]),
	);
	let halted: string | null = null;

	const planText = plan.steps
		.filter((st) => !recorded.has(st.id))
		.map(
			(s) =>
				`[${s.id}] (weight ${s.weight}${s.fatal ? ", FATAL" : ""}${s.bonus ? ", BONUS" : ""}) ${s.description}\n  Check: ${s.check}`,
		)
		.join("\n\n");

	const messages: Anthropic.MessageParam[] = [
		{
			role: "user",
			content: `Execute this test plan in order. Workspace: ${opts.workspaceDir}\n\n${planText}`,
		},
	];

	const tools: Anthropic.Tool[] = [
		{
			name: "bash",
			description:
				"Run a shell command in the artifact workspace. Returns exit code, stdout, stderr.",
			input_schema: {
				type: "object",
				properties: {
					command: { type: "string" },
					timeout_seconds: {
						type: "number",
						description: "default 60, max 300",
					},
				},
				required: ["command"],
			},
		},
		{
			name: "record_step",
			description:
				"Record the verdict for one test-plan step. Each step exactly once.",
			input_schema: {
				type: "object",
				properties: {
					stepId: { type: "string" },
					outcome: { type: "string", enum: ["pass", "partial", "fail"] },
					credit: { type: "number", minimum: 0, maximum: 1 },
					evidence: { type: "string" },
				},
				required: ["stepId", "outcome", "credit", "evidence"],
			},
		},
	];

	for (let i = 0; i < maxIterations && !halted; i++) {
		const response = await client.messages.create({
			model: opts.model,
			max_tokens: 4096,
			temperature: 0,
			system: EVALUATOR_SYSTEM,
			messages,
			tools,
		});
		messages.push({ role: "assistant", content: response.content });

		const toolUses = response.content.filter(
			(b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
		);
		if (toolUses.length === 0) break; // evaluator said DONE (or gave up)

		const results: Anthropic.ToolResultBlockParam[] = [];
		for (const use of toolUses) {
			if (use.name === "bash") {
				const input = use.input as BashToolInput;
				const timeout = Math.min(input.timeout_seconds ?? 60, 300) * 1000;
				let output: string;
				try {
					const { stdout, stderr } = await execFileAsync(
						"bash",
						["-c", input.command],
						{
							cwd: opts.workspaceDir,
							timeout,
							maxBuffer: 8 * 1024 * 1024,
							env: {
								...process.env,
								MOCK_LINEAR_URL: opts.mockLinearUrl,
								STUB_APP_SERVER: opts.stubAppServerPath,
								ANTHROPIC_API_KEY: "", // evaluator's key never reaches the artifact
							},
						},
					);
					output = `exit 0\nstdout:\n${stdout.slice(0, 16000)}\nstderr:\n${stderr.slice(0, 4000)}`;
				} catch (err) {
					const e = err as {
						code?: number | string;
						stdout?: string;
						stderr?: string;
					};
					output = `exit ${e.code ?? "error"}\nstdout:\n${(e.stdout ?? "").slice(0, 16000)}\nstderr:\n${(e.stderr ?? String(err)).slice(0, 4000)}`;
				}
				results.push({
					type: "tool_result",
					tool_use_id: use.id,
					content: output,
				});
			} else if (use.name === "record_step") {
				const parsed = StepResultSchema.safeParse(use.input);
				if (!parsed.success) {
					results.push({
						type: "tool_result",
						tool_use_id: use.id,
						content: `invalid record: ${parsed.error.issues.map((x) => x.message).join("; ")}`,
						is_error: true,
					});
					continue;
				}
				const record = parsed.data;
				const step = plan.steps.find((s) => s.id === record.stepId);
				if (!step) {
					results.push({
						type: "tool_result",
						tool_use_id: use.id,
						content: `unknown step id ${record.stepId}`,
						is_error: true,
					});
					continue;
				}
				recorded.set(record.stepId, record);
				opts.onRecord?.(record);
				results.push({
					type: "tool_result",
					tool_use_id: use.id,
					content: "recorded",
				});
				if (step.fatal && record.outcome === "fail") {
					halted = step.id;
				}
			}
		}
		messages.push({ role: "user", content: results });
	}

	// Fill unrecorded steps: fatal halt zeros the remainder; otherwise an
	// unrecorded step is an evaluator gap, scored fail with explicit evidence.
	for (const step of plan.steps) {
		if (!recorded.has(step.id)) {
			recorded.set(step.id, {
				stepId: step.id,
				outcome: "fail",
				credit: 0,
				evidence: halted
					? `not executed: test plan halted at fatal step ${halted}`
					: "not recorded by evaluator within iteration budget",
			});
		}
	}
	return scoreAdherence(plan, [...recorded.values()]);
}

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	type AdherenceResult,
	type CriterionScore,
	type QualityResult,
	type StepResult,
	StepResult as StepResultSchema,
	type TestPlan,
} from "../types";
import { scoreAdherence } from "./evaluator";
import { CRITERIA, median } from "./judge";

/**
 * Subscription-backed grading driver: hosts the evaluator and judge on
 * headless Claude Code (`claude -p`) instead of direct Anthropic SDK calls.
 * Claude Code accepts CLAUDE_CODE_OAUTH_TOKEN (Max plan); the SDK does not.
 *
 * Deviations from the SDK driver, recorded in grades.json:
 *   - temperature is not controllable via the CLI (SDK driver pins temp 0)
 *   - tool use is Claude Code's own Bash tool rather than our custom loop
 * Verdict capture: the agent appends JSON lines to a verdict file; the
 * harness parses/validates them (schema identical to the SDK path).
 */

export interface CCRunOptions {
	cwd: string;
	prompt: string;
	model: string;
	timeoutMs: number;
	env?: Record<string, string>;
}

export async function runCC(opts: CCRunOptions): Promise<string> {
	const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
	if (!token) throw new Error("CLAUDE_CODE_OAUTH_TOKEN is not set");
	const proc = Bun.spawn(
		[
			"claude",
			"-p",
			"--model",
			opts.model,
			"--output-format",
			"json",
			"--dangerously-skip-permissions",
		],
		{
			cwd: opts.cwd,
			stdin: new TextEncoder().encode(opts.prompt),
			stdout: "pipe",
			stderr: "pipe",
			env: {
				...process.env,
				...opts.env,
				CLAUDE_CODE_OAUTH_TOKEN: token,
				// Never bill the API account from the grading path.
				ANTHROPIC_API_KEY: "",
			},
		},
	);
	const timer = setTimeout(() => proc.kill(), opts.timeoutMs);
	const stdout = await new Response(proc.stdout).text();
	clearTimeout(timer);
	const exitCode = await proc.exited;
	const lines = stdout.split("\n").filter((l) => l.trim().startsWith("{"));
	for (const line of lines.reverse()) {
		try {
			const obj = JSON.parse(line) as Record<string, unknown>;
			if (obj.type === "result") {
				if (obj.is_error)
					throw new Error(
						`claude session error: ${String(obj.result).slice(0, 300)}`,
					);
				return typeof obj.result === "string" ? obj.result : "";
			}
		} catch (err) {
			if (err instanceof SyntaxError) continue;
			throw err;
		}
	}
	throw new Error(
		`no result from claude (exit ${exitCode}): ${stdout.slice(-400)}`,
	);
}

const NO_REPAIR = `Hard rules:
- NEVER repair, patch, or improve the artifact. Assess it AS-IS; broken behavior is a finding, not a task.
- Evidence-based verdicts only: cite commands run and output observed. Source-reading is for orientation; verdicts need observed behavior unless the check is explicitly static.
- Work like a QA engineer: start/stop the service, mutate mock tracker state via its /control endpoints, watch logs and the filesystem, then verdict.`;

export interface CCEvaluatorOptions {
	model: string;
	workspaceDir: string;
	trialDir: string;
	mockLinearUrl: string;
	stubAppServerPath: string;
	timeoutMs?: number;
	onRecord?: (r: StepResult) => void;
}

function parseVerdictFile(path: string): StepResult[] {
	if (!existsSync(path)) return [];
	const out: StepResult[] = [];
	for (const line of readFileSync(path, "utf8").split("\n")) {
		if (!line.trim()) continue;
		try {
			const parsed = StepResultSchema.safeParse(JSON.parse(line));
			if (parsed.success) out.push(parsed.data);
		} catch {
			// skip malformed lines; harness fills gaps as unrecorded
		}
	}
	return out;
}

/** Evaluator hosted on headless Claude Code (subscription-billed). */
export async function runEvaluatorCC(
	plan: TestPlan,
	opts: CCEvaluatorOptions,
): Promise<AdherenceResult> {
	const verdictFile = join(opts.trialDir, "cc-verdicts.jsonl");
	const already = parseVerdictFile(verdictFile);
	const done = new Set(already.map((r) => r.stepId));
	for (const r of already) opts.onRecord?.(r);

	const pending = plan.steps.filter((s) => !done.has(s.id));
	if (pending.length > 0) {
		const planText = pending
			.map(
				(s) =>
					`[${s.id}] (weight ${s.weight}${s.fatal ? ", FATAL — if this fails, STOP: record the failure and end the session" : ""}${s.bonus ? ", BONUS" : ""}) ${s.description}\n  Check: ${s.check}`,
			)
			.join("\n\n");
		const prompt = `You are a rigorous QA evaluator executing a fixed test plan against the built service in this directory (its spec is SPEC-REFERENCE.md).

${NO_REPAIR}

Environment:
- Mock Linear GraphQL API: ${opts.mockLinearUrl} (POST /control/seed, POST /control/set-state, GET /control/requests)
- Stub coding-agent app-server (JSON-line protocol): ${opts.stubAppServerPath} (modes via STUB_MODE=normal|crash|stall; logs to STUB_LOG_FILE)

After completing EACH step, append exactly one JSON line to ${verdictFile} :
{"stepId":"<id>","outcome":"pass|partial|fail","credit":<0..1>,"evidence":"<commands run and output observed>"}
Append with bash (>>). Record every step exactly once, in order. When all steps are recorded (or a FATAL step failed), reply DONE.

Test plan:

${planText}`;
		await runCC({
			cwd: opts.workspaceDir,
			prompt,
			model: opts.model,
			timeoutMs: opts.timeoutMs ?? 90 * 60 * 1000,
			env: {
				MOCK_LINEAR_URL: opts.mockLinearUrl,
				STUB_APP_SERVER: opts.stubAppServerPath,
			},
		});
	}

	const recorded = parseVerdictFile(verdictFile);
	for (const r of recorded) {
		if (!done.has(r.stepId)) opts.onRecord?.(r);
	}
	const byId = new Map(recorded.map((r) => [r.stepId, r]));
	const fatalFailed = plan.steps.find(
		(s) => s.fatal && byId.get(s.id)?.outcome === "fail",
	);
	const results: StepResult[] = plan.steps.map(
		(s) =>
			byId.get(s.id) ?? {
				stepId: s.id,
				outcome: "fail" as const,
				credit: 0,
				evidence: fatalFailed
					? `not executed: test plan halted at fatal step ${fatalFailed.id}`
					: "not recorded by evaluator session",
			},
	);
	return scoreAdherence(plan, results);
}

export interface CCJudgeOptions {
	model: string;
	blindWorkspaceDir: string;
	samples?: number;
	timeoutMs?: number;
	onCriterion?: (c: CriterionScore) => void;
	preScored?: CriterionScore[];
}

/** Code-quality judge hosted on headless Claude Code (subscription-billed). */
export async function judgeQualityCC(
	opts: CCJudgeOptions,
): Promise<QualityResult> {
	const samples = opts.samples ?? 3;
	const criteria: CriterionScore[] = [...(opts.preScored ?? [])];
	const done = new Set(criteria.map((c) => c.criterion));
	for (const criterion of CRITERIA) {
		if (done.has(criterion.key)) continue;
		const runs: { score: number; justification: string }[] = [];
		let retriesLeft = 2; // parse/transport failures are judge-infra, not artifact signal
		for (let s = 0; s < samples; s++) {
			const prompt = `You are a senior engineer reviewing an anonymous codebase implementing a daemon service against the spec at SPEC-REFERENCE.md in this directory.

Score ONE criterion from 0-10, evidence-based: run commands (tests, linters, type checkers, grep) and cite what you observed. Do not guess what produced the code. NEVER modify the artifact.

Criterion: ${criterion.prompt}

Your FINAL message must end with exactly one JSON object on its own line:
{"score": <0-10>, "justification": "<evidence-citing rationale>"}`;
			const text = await runCC({
				cwd: opts.blindWorkspaceDir,
				prompt,
				model: opts.model,
				timeoutMs: opts.timeoutMs ?? 20 * 60 * 1000,
			});
			const match = text.match(/\{[^{}]*"score"[\s\S]*?\}/g)?.at(-1);
			let parsed: { score: number; justification: string } | null = null;
			if (match) {
				try {
					parsed = JSON.parse(match) as {
						score: number;
						justification: string;
					};
				} catch {
					parsed = null;
				}
			}
			if (!parsed) {
				// Unparseable output is a judge failure, not a 0-quality artifact:
				// retry the sample (bounded) instead of poisoning the median.
				if (retriesLeft > 0) {
					retriesLeft--;
					s--;
					continue;
				}
				runs.push({
					score: 0,
					justification:
						"judge failed to produce a parseable score after retries",
				});
				continue;
			}
			runs.push({
				score: Math.max(0, Math.min(10, Number(parsed.score))),
				justification: String(parsed.justification),
			});
		}
		const scores = runs.map((r) => r.score);
		const med = median(scores);
		const scored: CriterionScore = {
			criterion: criterion.key,
			samples: scores,
			score: med,
			justification: runs.find((r) => r.score === med)?.justification ?? "",
		};
		criteria.push(scored);
		opts.onCriterion?.(scored);
	}
	const mean = criteria.reduce((a, c) => a + c.score, 0) / criteria.length;
	return {
		judgeModel: `${opts.model} (claude-code driver)`,
		criteria,
		score: Math.round(mean * 10 * 100) / 100,
	};
}

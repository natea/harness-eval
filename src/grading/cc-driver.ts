import { spawn } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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

export interface CaptureResult {
	output: string;
	exitCode: number;
	timedOut: boolean;
}

/**
 * Run a shell session in its OWN process group, capture its merged output to a
 * file, and read that file after the foreground process exits.
 *
 * Two properties matter for grading reliability:
 *  - **File capture, not the live pipe.** The evaluator/judge agent routinely
 *    starts the service under test; that daemon inherits the session's stdout
 *    fd. Reading the live stdout pipe (`new Response(proc.stdout).text()`) only
 *    resolves at EOF — i.e. once every writer closes — so a lingering daemon
 *    would block the read until the watchdog killed claude, wedging the grade.
 *    Reading a file after the process exits sidesteps the inherited pipe.
 *  - **Own process group + group kill.** `detached: true` makes the shell a
 *    process-group leader; on timeout (and again after exit) we signal the whole
 *    group, so any service the agent started is reaped instead of leaking ports
 *    and file descriptors into the next sample/trial.
 *
 * The capture file lives in the OS temp dir, never the graded workspace, so it
 * cannot contaminate the blind code-quality judge.
 */
export async function captureSession(
	shellCmd: string,
	opts: { cwd?: string; env?: Record<string, string>; timeoutMs: number },
): Promise<CaptureResult> {
	const dir = mkdtempSync(join(tmpdir(), "he-grade-"));
	const outFile = join(dir, "out.log");
	const child = spawn(
		"bash",
		["-lc", `( ${shellCmd} ) > ${JSON.stringify(outFile)} 2>&1`],
		{
			cwd: opts.cwd,
			detached: true, // own process group → group-kill reaps started services
			stdio: "ignore",
			env: { ...process.env, ...opts.env } as NodeJS.ProcessEnv,
		},
	);

	const killGroup = (sig: NodeJS.Signals) => {
		if (child.pid === undefined) return;
		try {
			process.kill(-child.pid, sig); // negative pid → whole process group
		} catch {
			// group already gone
		}
	};

	let timedOut = false;
	let escalation: ReturnType<typeof setTimeout> | undefined;
	const timer = setTimeout(() => {
		timedOut = true;
		killGroup("SIGTERM");
		escalation = setTimeout(() => killGroup("SIGKILL"), 5000);
	}, opts.timeoutMs);

	const exitCode = await new Promise<number>((resolve) => {
		child.on("exit", (code) => resolve(code ?? -1));
		child.on("error", () => resolve(-1));
	});
	clearTimeout(timer);
	if (escalation) clearTimeout(escalation);
	// Reap any service the session left running (it shares the group).
	killGroup("SIGKILL");

	let output = "";
	try {
		output = readFileSync(outFile, "utf8");
	} catch {
		// no output captured
	}
	try {
		rmSync(dir, { recursive: true, force: true });
	} catch {
		// best-effort cleanup
	}
	return { output, exitCode, timedOut };
}

export async function runCC(opts: CCRunOptions): Promise<string> {
	const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
	if (!token) throw new Error("CLAUDE_CODE_OAUTH_TOKEN is not set");
	const promptDir = mkdtempSync(join(tmpdir(), "he-prompt-"));
	const promptFile = join(promptDir, "prompt.txt");
	writeFileSync(promptFile, opts.prompt);
	const shellCmd = [
		`cat ${JSON.stringify(promptFile)} |`,
		"claude -p",
		`--model ${JSON.stringify(opts.model)}`,
		"--output-format json",
		"--dangerously-skip-permissions",
	].join(" ");

	const { output, exitCode, timedOut } = await captureSession(shellCmd, {
		cwd: opts.cwd,
		timeoutMs: opts.timeoutMs,
		env: {
			...opts.env,
			CLAUDE_CODE_OAUTH_TOKEN: token,
			// Never bill the API account from the grading path.
			ANTHROPIC_API_KEY: "",
		},
	});
	try {
		rmSync(promptDir, { recursive: true, force: true });
	} catch {
		// best-effort cleanup
	}

	if (timedOut)
		throw new Error(
			`claude grading session timed out after ${opts.timeoutMs}ms (process group killed)`,
		);

	const lines = output.split("\n").filter((l) => l.trim().startsWith("{"));
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
		`no result from claude (exit ${exitCode}): ${output.slice(-400)}`,
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
	// ABSOLUTE path: the grading agent runs with cwd = the workspace copy (which is
	// OUTSIDE the repo since the package.json-isolation fix), so a relative verdict
	// path would make its `>> cc-verdicts.jsonl` land in the copy (then deleted) and
	// runEvaluatorCC would read an empty file at the repo root — exactly the
	// "every step: not recorded by evaluator session" false-zero. Resolve to the
	// real trial dir so writer and reader agree regardless of cwd.
	const verdictFile = resolve(opts.trialDir, "cc-verdicts.jsonl");
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

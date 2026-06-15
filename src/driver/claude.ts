import type { Sandbox } from "../providers/types";
import { type SessionRecord, TokenUsage } from "../types";

export interface ClaudeResult {
	record: SessionRecord;
	/** Final result text from the session (used for gate detection). */
	resultText: string;
	sessionId: string;
	/** Raw stream-json transcript (one JSON object per line). */
	transcript: string;
}

export interface ClaudeRunOptions {
	model: string;
	prompt: string;
	stepIndex: number;
	/** Resume an existing session instead of starting fresh. */
	resumeSessionId?: string;
	timeoutMs: number;
	env?: Record<string, string>;
}

/**
 * Run one headless Claude Code session inside a sandbox and parse its
 * stream-json output. The final `result` message is the source of truth for
 * duration, usage, cost, and turn count (run-telemetry spec).
 *
 * `--dangerously-skip-permissions` is acceptable only because every trial
 * runs in a disposable sandbox (design D4).
 */
export async function runClaudeSession(
	sandbox: Sandbox,
	opts: ClaudeRunOptions,
): Promise<ClaudeResult> {
	// Namespace by sandbox id, not just step index: on shared-filesystem
	// providers (worktree runs on the host shell, so /tmp is shared across
	// trials) two concurrent trials at the same step would otherwise both write
	// and `cat` the same /tmp/he-out-<step>.jsonl, cross-contaminating
	// transcripts and session ids (a clobbered session id then breaks --resume
	// with "No conversation found"). The sandbox id is unique per trial.
	const slot = `${sandbox.id.replace(/[^a-zA-Z0-9_.-]/g, "_")}-${opts.stepIndex}`;
	const promptFile = `/tmp/he-prompt-${slot}.txt`;
	const outFile = `/tmp/he-out-${slot}.jsonl`;
	await sandbox.writeFile(promptFile, opts.prompt);
	const resume = opts.resumeSessionId
		? `--resume ${JSON.stringify(opts.resumeSessionId)}`
		: "";
	// Output goes to a FILE, not the exec stream: agents routinely spawn
	// daemons (e.g. the service they just built) that inherit stdout and
	// would otherwise hold the exec stream open forever after claude exits.
	const cmd = [
		`cat ${promptFile} |`,
		"claude -p",
		`--model ${JSON.stringify(opts.model)}`,
		"--output-format stream-json --verbose",
		"--dangerously-skip-permissions",
		resume,
		`> ${outFile} 2>&1`,
	]
		.filter(Boolean)
		.join(" ");

	const res = await sandbox.exec(cmd, {
		timeoutMs: opts.timeoutMs,
		env: opts.env,
	});
	const read = await sandbox.exec(`cat ${outFile}`, { timeoutMs: 120_000 });
	return parseStreamJson(read.stdout, opts.stepIndex, res.exitCode);
}

export function parseStreamJson(
	output: string,
	stepIndex: number,
	exitCode: number,
): ClaudeResult {
	let result: Record<string, unknown> | null = null;
	let sessionId = "";
	const lines = output.split("\n").filter((l) => l.trim().startsWith("{"));
	for (const line of lines) {
		try {
			const obj = JSON.parse(line) as Record<string, unknown>;
			if (typeof obj.session_id === "string") sessionId = obj.session_id;
			if (obj.type === "result") result = obj;
		} catch {
			// non-JSON noise in stream; ignore
		}
	}
	if (!result) {
		throw new SessionParseError(
			`no result message in session output (exit ${exitCode}); last 500 chars: ${output.slice(-500)}`,
		);
	}
	const usageRaw = (result.usage ?? {}) as Record<string, unknown>;
	const usage = TokenUsage.parse({
		inputTokens: Number(usageRaw.input_tokens ?? 0),
		outputTokens: Number(usageRaw.output_tokens ?? 0),
		cacheReadTokens: Number(usageRaw.cache_read_input_tokens ?? 0),
		cacheCreationTokens: Number(usageRaw.cache_creation_input_tokens ?? 0),
	});
	const record: SessionRecord = {
		sessionId,
		stepIndex,
		durationMs: Number(result.duration_ms ?? 0),
		numTurns: Number(result.num_turns ?? 0),
		costUsd: Number(result.total_cost_usd ?? 0),
		usage,
		isError: Boolean(result.is_error) || exitCode !== 0,
	};
	return {
		record,
		resultText: typeof result.result === "string" ? result.result : "",
		sessionId,
		transcript: output,
	};
}

export class SessionParseError extends Error {}

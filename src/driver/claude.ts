import type { Sandbox } from "../providers/types";
import { type SessionRecord, TokenUsage } from "../types";
import { createPrintCliSessionRunner } from "./print-cli";
import type { DriverResult, DriverRunOptions, HarnessDriver } from "./types";

export type ClaudeResult = DriverResult;
export type ClaudeRunOptions = DriverRunOptions;

const runClaudePrintCli = createPrintCliSessionRunner({
	buildCommand: (opts) => {
		const resume = opts.resumeSessionId
			? `--resume ${JSON.stringify(opts.resumeSessionId)}`
			: "";
		// Output goes to a FILE, not the exec stream: agents routinely spawn
		// daemons (e.g. the service they just built) that inherit stdout and
		// would otherwise hold the exec stream open forever after claude exits.
		return [
			`cat ${opts.promptFile} |`,
			"claude -p",
			`--model ${JSON.stringify(opts.model)}`,
			"--output-format stream-json --verbose",
			"--dangerously-skip-permissions",
			resume,
			`> ${opts.outFile} 2>&1`,
		]
			.filter(Boolean)
			.join(" ");
	},
	parseOutput: parseStreamJson,
});

export const claudeCodeDriver: HarnessDriver = {
	id: "claude-code",
	runSession: runClaudePrintCli,
};

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
	return claudeCodeDriver.runSession(sandbox, opts);
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

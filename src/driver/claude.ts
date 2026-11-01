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
		// Isolated trials: no MCP config, no provider-side web tools (4.6/4.8).
		const isolation = opts.isolated
			? ["--strict-mcp-config", '--disallowedTools "WebSearch" "WebFetch"']
			: [];
		// Output goes to a FILE, not the exec stream: agents routinely spawn
		// daemons (e.g. the service they just built) that inherit stdout and
		// would otherwise hold the exec stream open forever after claude exits.
		return [
			`cat ${opts.promptFile} |`,
			"claude -p",
			`--model ${JSON.stringify(opts.model)}`,
			"--output-format stream-json --verbose",
			"--dangerously-skip-permissions",
			...isolation,
			resume,
			`> ${opts.outFile} 2>&1`,
		]
			.filter(Boolean)
			.join(" ");
	},
	parseOutput: parseStreamJson,
	parsePartial: parsePartialStreamJson,
	// [c] keeps the pattern from matching the shell running this very command.
	stopCommand: 'pkill -TERM -f "[c]laude -p" || true',
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
	let harnessVersion: string | undefined;
	const lines = output.split("\n").filter((l) => l.trim().startsWith("{"));
	for (const line of lines) {
		try {
			const obj = JSON.parse(line) as Record<string, unknown>;
			if (typeof obj.session_id === "string") sessionId = obj.session_id;
			if (typeof obj.claude_code_version === "string")
				harnessVersion = obj.claude_code_version;
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
		harnessVersion,
	};
}

export class SessionParseError extends Error {}

/**
 * $/Mtok [input, output, cache read, cache write], only for models checked against
 * real sessions: Claude Code's `total_cost_usd` reproduced to the cent from each
 * result's token usage. Cache writes bill at the 1-hour rate.
 */
const VERIFIED_RATES: Record<string, [number, number, number, number]> = {
	"claude-sonnet-4-6": [3, 15, 0.3, 6],
};

/**
 * Telemetry for a session with no `result` message, rebuilt from its assistant
 * messages. Usage is keyed by message id because one message spans several events.
 * Cost is an estimate and a lower bound: on complete sessions this method came in * roughly 10–35% under the real figure. Zero when the model has no verified rates.
 */
export function parsePartialStreamJson(
	output: string,
	stepIndex: number,
	exitCode: number,
	elapsedMs: number,
): ClaudeResult | null {
	let sessionId = "";
	let model = "";
	const usageById = new Map<string, Record<string, unknown>>();
	for (const line of output.split("\n")) {
		if (!line.trim().startsWith("{")) continue;
		let obj: Record<string, any>;
		try {
			obj = JSON.parse(line);
		} catch {
			continue;
		}
		if (typeof obj.session_id === "string") sessionId = obj.session_id;
		if (obj.type !== "assistant" || !obj.message?.id) continue;
		model = obj.message.model ?? model;
		usageById.set(obj.message.id, obj.message.usage ?? {});
	}
	if (usageById.size === 0) return null;
	const usage = {
		inputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		cacheCreationTokens: 0,
	};
	for (const u of usageById.values()) {
		usage.inputTokens += Number(u.input_tokens ?? 0);
		usage.outputTokens += Number(u.output_tokens ?? 0);
		usage.cacheReadTokens += Number(u.cache_read_input_tokens ?? 0);
		usage.cacheCreationTokens += Number(u.cache_creation_input_tokens ?? 0);
	}
	const rates = VERIFIED_RATES[model];
	const costUsd = rates
		? (usage.inputTokens * rates[0] +
				usage.outputTokens * rates[1] +
				usage.cacheReadTokens * rates[2] +
				usage.cacheCreationTokens * rates[3]) /
			1e6
		: 0;
	return {
		record: {
			sessionId,
			stepIndex,
			durationMs: Math.round(elapsedMs),
			numTurns: usageById.size,
			costUsd,
			usage: TokenUsage.parse(usage),
			isError: true,
			partial: true,
		},
		resultText: "",
		sessionId,
		transcript: output,
		exitCode,
	};
}

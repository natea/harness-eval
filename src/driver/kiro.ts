import { type SessionRecord, TokenUsage } from "../types";
import { SessionParseError } from "./claude";
import { createPrintCliSessionRunner } from "./print-cli";
import type { DriverResult, HarnessDriver } from "./types";

/**
 * Kiro CLI driver (kiro.dev; successor to the Amazon Q Developer CLI).
 *
 * Headless: `kiro-cli chat --no-interactive --trust-all-tools
 * --output-format stream-json`, one turn per invocation. Output is redirected to
 * a file and read back in a separate exec (a started service must not hold the
 * capture open).
 *
 * stream-json events (verified against the Kiro CLI / agentic-coding-harness
 * normalizer):
 *   {type:"runStarted",  data:{sessionId}}
 *   {type:"sessionUpdate", data:{sessionId, update:{sessionUpdate:
 *       "agent_message_chunk"|"agent_thought_chunk"|"tool_call"|..., content?}}}
 *   {type:"metadata",    data:{sessionId, meteringUsage, turnDurationMs?}}
 *   {type:"runFinished", data:{sessionId, status, stopReason}}      → turn terminal
 *   error events carry {error|message|reason}
 *
 * Kiro meters subscription credits and reports no per-token USD, so costUsd is 0
 * and usage is populated only when a tokenUsage-shaped event is present →
 * reportsCost: false (profile-priced/tokens-only downstream).
 */
const runKiro = createPrintCliSessionRunner({
	buildCommand: (opts) => {
		const resume = opts.resumeSessionId
			? `--resume-id ${JSON.stringify(opts.resumeSessionId)}`
			: "";
		return [
			"kiro-cli chat",
			"--no-interactive",
			// Non-interactive auto-approval: acceptable only in a disposable sandbox.
			"--trust-all-tools",
			"--output-format stream-json",
			`--model ${JSON.stringify(opts.model)}`,
			resume,
			`"$(cat ${opts.promptFile})"`,
			`> ${opts.outFile} 2>&1`,
		]
			.filter(Boolean)
			.join(" ");
	},
	parseOutput: parseKiroStreamJson,
});

export const kiroDriver: HarnessDriver = {
	id: "kiro",
	runSession: runKiro,
};

/**
 * Parse `kiro-cli chat --output-format stream-json` into the common
 * SessionRecord. One `runFinished` is one completed turn. Missing terminal event
 * → SessionParseError (candidate-side, not infra).
 */
export function parseKiroStreamJson(
	output: string,
	stepIndex: number,
	exitCode: number,
): DriverResult {
	let sessionId = "";
	let numTurns = 0;
	let durationMs = 0;
	let inputTokens = 0;
	let outputTokens = 0;
	let cacheReadTokens = 0;
	let cacheCreationTokens = 0;
	let resultText = "";
	let sawTerminal = false;
	let streamError = false;

	// Kiro may wrap payloads in `data`; accept both wrapped and flat shapes.
	const addUsage = (raw: Record<string, unknown>) => {
		inputTokens += Number(raw.inputTokens ?? raw.input_tokens ?? 0);
		outputTokens += Number(raw.outputTokens ?? raw.output_tokens ?? 0);
		cacheReadTokens += Number(
			raw.cacheReadTokens ?? raw.cache_read_tokens ?? 0,
		);
		cacheCreationTokens += Number(
			raw.cacheWriteTokens ?? raw.cache_write_tokens ?? 0,
		);
	};

	const lines = output.split("\n").filter((l) => l.trim().startsWith("{"));
	for (const line of lines) {
		let obj: Record<string, unknown>;
		try {
			obj = JSON.parse(line) as Record<string, unknown>;
		} catch {
			continue; // non-JSON noise in the stream; ignore
		}
		const data = (obj.data ?? obj) as Record<string, unknown>;
		if (typeof data.sessionId === "string") sessionId = data.sessionId;
		const type = String(obj.type ?? "");

		switch (type) {
			case "sessionUpdate": {
				const update = (data.update ?? {}) as Record<string, unknown>;
				if (update.sessionUpdate === "agent_message_chunk") {
					const content = (update.content ?? {}) as Record<string, unknown>;
					const text = content.text ?? update.text;
					if (typeof text === "string") {
						resultText = resultText ? `${resultText}\n${text}` : text;
					}
				}
				break;
			}
			case "metadata": {
				const turnMs = data.turnDurationMs ?? data.durationMs;
				if (typeof turnMs === "number") durationMs += turnMs;
				break;
			}
			case "runFinished": {
				sawTerminal = true;
				numTurns++;
				const status = String(data.status ?? "");
				if (/error|fail/i.test(status)) streamError = true;
				break;
			}
			default: {
				// Token-usage events are not guaranteed; accept them if present.
				const usage = (data.tokenUsage ?? obj.tokenUsage) as
					| Record<string, unknown>
					| undefined;
				if (usage) addUsage(usage);
				// Legacy/alternate error event kinds ("error", "runError", ...).
				if (/error/i.test(type)) streamError = true;
			}
		}
	}

	if (!sawTerminal && !streamError) {
		throw new SessionParseError(
			`no runFinished/error in kiro output (exit ${exitCode}); last 500 chars: ${output.slice(-500)}`,
		);
	}

	const usage = TokenUsage.parse({
		inputTokens,
		outputTokens,
		cacheReadTokens,
		cacheCreationTokens,
	});
	const record: SessionRecord = {
		sessionId,
		stepIndex,
		durationMs,
		numTurns,
		costUsd: 0, // Kiro reports metering credits, not billed USD
		usage,
		isError: streamError || exitCode !== 0,
	};
	return { record, resultText, sessionId, transcript: output };
}

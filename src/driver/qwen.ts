import { type SessionRecord, TokenUsage } from "../types";
import { SessionParseError } from "./claude";
import { createPrintCliSessionRunner } from "./print-cli";
import type { DriverResult, HarnessDriver } from "./types";

/**
 * Qwen Code (github.com/QwenLM/qwen-code, `@qwen-code/qwen-code`) driver.
 *
 * Qwen Code is a Gemini-CLI fork: one headless turn via `qwen -p <prompt>`, with
 * `--output-format stream-json` emitting line-delimited JSON in the Claude Code
 * shape (`system` / `assistant` / `result`). Output is redirected to a file and
 * read back in a separate exec (a started service must not hold the capture
 * open).
 *
 * Auth is OpenAI-compatible and env-only: the model transport injects
 * OPENAI_API_KEY + OPENAI_BASE_URL (DashScope compatible-mode for Qwen models).
 * Qwen Code reports token usage but no billed USD → reportsCost: false.
 */
const runQwen = createPrintCliSessionRunner({
	buildCommand: (opts) => {
		// Resume a prior session when continuing (gate continuations/later steps).
		const resume = opts.resumeSessionId
			? `--resume ${JSON.stringify(opts.resumeSessionId)}`
			: "";
		return [
			"qwen",
			"--prompt",
			`"$(cat ${opts.promptFile})"`,
			"--output-format stream-json",
			// Non-interactive auto-approval: acceptable only in a disposable sandbox.
			"--yolo",
			`--model ${JSON.stringify(opts.model)}`,
			resume,
			`> ${opts.outFile} 2>&1`,
		]
			.filter(Boolean)
			.join(" ");
	},
	parseOutput: parseQwenStreamJson,
});

export const qwenCodeDriver: HarnessDriver = {
	id: "qwen-code",
	runSession: runQwen,
};

/**
 * Parse `qwen --output-format stream-json` into the common SessionRecord. The
 * final `result` message is the source of truth (duration, usage, turn count);
 * Qwen emits no dollar cost, so costUsd is 0 and the run-level cost source is
 * resolved downstream (profile-priced / tokens-only).
 */
export function parseQwenStreamJson(
	output: string,
	stepIndex: number,
	exitCode: number,
): DriverResult {
	let result: Record<string, unknown> | null = null;
	let sessionId = "";
	let assistantMessages = 0;

	const lines = output.split("\n").filter((l) => l.trim().startsWith("{"));
	for (const line of lines) {
		let obj: Record<string, unknown>;
		try {
			obj = JSON.parse(line) as Record<string, unknown>;
		} catch {
			continue; // non-JSON noise in the stream; ignore
		}
		if (typeof obj.session_id === "string") sessionId = obj.session_id;
		if (obj.type === "assistant") assistantMessages++;
		if (obj.type === "result") result = obj;
	}

	if (!result) {
		throw new SessionParseError(
			`no result message in qwen output (exit ${exitCode}); last 500 chars: ${output.slice(-500)}`,
		);
	}

	const usageRaw = (result.usage ?? {}) as Record<string, unknown>;
	const usage = TokenUsage.parse({
		inputTokens: Number(usageRaw.input_tokens ?? usageRaw.inputTokens ?? 0),
		outputTokens: Number(usageRaw.output_tokens ?? usageRaw.outputTokens ?? 0),
		cacheReadTokens: Number(
			usageRaw.cache_read_input_tokens ?? usageRaw.cacheReadTokens ?? 0,
		),
		cacheCreationTokens: Number(
			usageRaw.cache_creation_input_tokens ?? usageRaw.cacheWriteTokens ?? 0,
		),
	});
	const numTurns = Number(
		result.num_turns ?? result.numTurns ?? (assistantMessages || 1),
	);
	const record: SessionRecord = {
		sessionId,
		stepIndex,
		durationMs: Number(result.duration_ms ?? result.durationMs ?? 0),
		numTurns,
		costUsd: 0, // Qwen reports no dollar cost; resolved by cost-source rule
		usage,
		isError: Boolean(result.is_error ?? result.isError) || exitCode !== 0,
	};
	return {
		record,
		resultText: typeof result.result === "string" ? result.result : "",
		sessionId,
		transcript: output,
	};
}

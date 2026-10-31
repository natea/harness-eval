import { type SessionRecord, TokenUsage } from "../types";
import { SessionParseError } from "./claude";
import { createPrintCliSessionRunner } from "./print-cli";
import type { DriverResult, HarnessDriver } from "./types";

/**
 * OpenCode (opencode.ai) CLI driver.
 *
 * OpenCode is a model-agnostic terminal coding agent. `opencode run` executes one
 * non-interactive turn; `--format json` emits one NDJSON event per line
 * (`{type, timestamp, sessionID, part}`), redirected to a file and read back in a
 * separate exec (a started service must not hold the capture open).
 *
 * Events (verified against the v2 CLI source, packages/cli/src/run/noninteractive.ts):
 *   step_start  part.type=step-start
 *   text        part.type=text, part.text
 *   tool_use    part.type=tool
 *   step_finish part.type=step-finish, part.cost (USD), part.tokens {input,output,cache{read,write}}
 *   error       error.{...}                                         → failure
 *
 * There is no single terminal result line: every `step_finish` ends one model
 * step (a turn). Cost is models.dev-priced USD, so OpenCode reports cost.
 */
const runOpencode = createPrintCliSessionRunner({
	buildCommand: (opts) => {
		// Resume the previous session when continuing (gate continuations, later
		// scripted steps). `--session` takes the session id emitted on every event.
		const resume = opts.resumeSessionId
			? `--session ${JSON.stringify(opts.resumeSessionId)}`
			: "";
		// `--auto` auto-approves permissions not explicitly denied — acceptable only
		// because every trial runs in a disposable sandbox.
		return [
			"export OPENCODE_DISABLE_AUTOUPDATE=1;",
			"opencode run",
			`--model ${JSON.stringify(opencodeModelRef(opts.model))}`,
			"--format json",
			"--auto",
			resume,
			// The prompt is passed as a single argv value, read from the file the
			// shared runner wrote (command substitution is not re-parsed).
			`"$(cat ${opts.promptFile})"`,
			`> ${opts.outFile} 2>&1`,
		]
			.filter(Boolean)
			.join(" ");
	},
	parseOutput: parseOpencodeJson,
});

export const opencodeDriver: HarnessDriver = {
	id: "opencode",
	runSession: runOpencode,
};

/**
 * OpenCode model ids are `provider/model` (models.dev). Run profiles carry the
 * bare model id, so map the common vendors and leave explicit ids untouched.
 */
export function opencodeModelRef(model: string): string {
	if (model.includes("/")) return model;
	if (model.startsWith("claude-")) return `anthropic/${model}`;
	if (model.startsWith("gpt-") || /^o\d/.test(model)) return `openai/${model}`;
	return model;
}

/**
 * Parse the `opencode run --format json` NDJSON event stream into the common
 * SessionRecord. Cost and tokens come from each `step_finish` part; the last
 * text part is the final answer. A run with no `step_finish` and no `error`
 * never completed its turn → SessionParseError (candidate-side, not infra).
 */
export function parseOpencodeJson(
	output: string,
	stepIndex: number,
	exitCode: number,
): DriverResult {
	let sessionId = "";
	let numTurns = 0;
	let costUsd = 0;
	let inputTokens = 0;
	let outputTokens = 0;
	let cacheReadTokens = 0;
	let cacheCreationTokens = 0;
	let resultText = "";
	let sawTerminal = false;
	let streamError = false;

	const lines = output.split("\n").filter((l) => l.trim().startsWith("{"));
	for (const line of lines) {
		let obj: Record<string, unknown>;
		try {
			obj = JSON.parse(line) as Record<string, unknown>;
		} catch {
			continue; // non-JSON noise in the stream; ignore
		}
		if (typeof obj.sessionID === "string") sessionId = obj.sessionID;
		const part = (obj.part ?? {}) as Record<string, unknown>;
		switch (obj.type) {
			case "text": {
				const text = part.text;
				if (typeof text === "string") {
					resultText = resultText ? `${resultText}\n${text}` : text;
				}
				break;
			}
			case "step_finish": {
				sawTerminal = true;
				numTurns++;
				costUsd += Number(part.cost ?? 0);
				const tokens = (part.tokens ?? {}) as Record<string, unknown>;
				const cache = (tokens.cache ?? {}) as Record<string, unknown>;
				inputTokens += Number(tokens.input ?? 0);
				outputTokens += Number(tokens.output ?? 0);
				cacheReadTokens += Number(cache.read ?? 0);
				cacheCreationTokens += Number(cache.write ?? 0);
				break;
			}
			case "error":
				streamError = true;
				break;
		}
	}

	if (!sawTerminal && !streamError) {
		throw new SessionParseError(
			`no step_finish/error in opencode output (exit ${exitCode}); last 500 chars: ${output.slice(-500)}`,
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
		durationMs: 0, // not emitted by opencode run --format json
		numTurns,
		costUsd, // models.dev-priced USD, reported per step
		usage,
		isError: streamError || exitCode !== 0,
	};
	return { record, resultText, sessionId, transcript: output };
}

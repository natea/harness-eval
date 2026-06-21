import { type SessionRecord, TokenUsage } from "../types";
import { SessionParseError } from "./claude";
import { createPrintCliSessionRunner } from "./print-cli";
import type { DriverResult, HarnessDriver } from "./types";

/**
 * OpenAI Codex CLI driver. Codex is model-agnostic: the model + provider are
 * configured from the run's worker profile (built-in `openai`/`ollama`/`lmstudio`
 * or a custom `[model_providers.<id>]` block); `codex exec` runs one
 * non-interactive turn. Output is the `--json` JSONL event stream, redirected to
 * a file (a started service must not hold the exec stream open) and read back.
 */
const runCodexExec = createPrintCliSessionRunner({
	buildCommand: (opts) => {
		// Resume a prior rollout when continuing (gate continuations). The flag is
		// `resume <SESSION_ID>`; absent on the first turn.
		const resume = opts.resumeSessionId
			? `resume ${JSON.stringify(opts.resumeSessionId)}`
			: "";
		// Codex authenticates from $CODEX_HOME/auth.json — NOT from $OPENAI_API_KEY
		// directly (verified against codex 0.139.0: a bare key env still 401s). So
		// write the key once with `codex login --with-api-key` before exec. An
		// isolated, per-slot CODEX_HOME keeps concurrent trials on a shared
		// filesystem from colliding and ensures no ambient sign-in takes
		// precedence over the run's key. (OpenAI-provider path; a non-OpenAI
		// worker model uses a `model_providers` block instead — see design.md.)
		const codexHome = opts.outFile.replace(
			/he-out-(.+)\.jsonl$/,
			"he-codex-$1",
		);
		// `--skip-git-repo-check` so a non-repo workspace doesn't block; the trial
		// sandbox is disposable, mirroring claude's --dangerously-skip-permissions.
		const exec = [
			"codex exec",
			resume,
			`--model ${JSON.stringify(opts.model)}`,
			"--json",
			"--dangerously-bypass-approvals-and-sandbox",
			"--skip-git-repo-check",
			`- < ${opts.promptFile}`,
			`> ${opts.outFile} 2>&1`,
		]
			.filter(Boolean)
			.join(" ");
		// `;`-joined so exec always runs (and captures any auth error in outFile)
		// even if login is a no-op (e.g. OPENAI_API_KEY unset on an --oss run).
		return [
			`export CODEX_HOME=${codexHome}`,
			`mkdir -p ${codexHome}`,
			"printenv OPENAI_API_KEY | codex login --with-api-key > /dev/null 2>&1 || true",
			exec,
		].join("; ");
	},
	parseOutput: parseCodexJsonl,
});

export const codexDriver: HarnessDriver = {
	id: "codex",
	runSession: runCodexExec,
};

/**
 * Parse the `codex exec --json` JSONL event stream into the common
 * SessionRecord. Events (one top-level object per line):
 *   {"type":"thread.started","thread_id":"..."}     → session id
 *   {"type":"turn.started"}                          → one per turn
 *   {"type":"item.completed","item":{"type":"agent_message","text":"..."}}
 *   {"type":"turn.completed","usage":{input_tokens,cached_input_tokens,output_tokens}}
 *   {"type":"turn.failed","error":{...}} | {"type":"error",...}  → failure
 * Codex reports tokens but NO dollar cost and NO model name, so costUsd is 0 and
 * the cost source is resolved downstream (profile-priced / tokens-only). Duration
 * is not in the stream → 0.
 */
export function parseCodexJsonl(
	output: string,
	stepIndex: number,
	exitCode: number,
): DriverResult {
	let sessionId = "";
	let numTurns = 0;
	let inputTokens = 0;
	let outputTokens = 0;
	let cacheReadTokens = 0;
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
		switch (obj.type) {
			case "thread.started":
				if (typeof obj.thread_id === "string") sessionId = obj.thread_id;
				break;
			case "turn.started":
				numTurns++;
				break;
			case "item.completed": {
				const item = (obj.item ?? {}) as Record<string, unknown>;
				if (item.type === "agent_message" && typeof item.text === "string") {
					resultText = item.text; // last agent message wins (final answer)
				}
				break;
			}
			case "turn.completed": {
				sawTerminal = true;
				const usage = (obj.usage ?? {}) as Record<string, unknown>;
				inputTokens += Number(usage.input_tokens ?? 0);
				outputTokens += Number(usage.output_tokens ?? 0);
				cacheReadTokens += Number(usage.cached_input_tokens ?? 0);
				break;
			}
			case "turn.failed":
				sawTerminal = true;
				streamError = true;
				break;
			case "error":
				// Transient "Reconnecting... X/Y" notices are non-fatal; anything else
				// is a real stream error.
				if (!String(obj.message ?? "").startsWith("Reconnecting")) {
					streamError = true;
				}
				break;
		}
	}

	if (!sawTerminal && !streamError) {
		throw new SessionParseError(
			`no turn.completed/turn.failed in codex output (exit ${exitCode}); last 500 chars: ${output.slice(-500)}`,
		);
	}

	const usage = TokenUsage.parse({
		inputTokens,
		outputTokens,
		cacheReadTokens,
		cacheCreationTokens: 0,
	});
	const record: SessionRecord = {
		sessionId,
		stepIndex,
		durationMs: 0, // not emitted by codex exec --json
		numTurns,
		costUsd: 0, // codex reports no dollar cost; resolved by cost-source rule
		usage,
		isError: streamError || exitCode !== 0,
	};
	return { record, resultText, sessionId, transcript: output };
}

import { type SessionRecord, TokenUsage } from "../types";
import { SessionParseError } from "./claude";
import { createPrintCliSessionRunner } from "./print-cli";
import { type DriverResult, type HarnessDriver, InfraError } from "./types";

/**
 * ZeroClaw (zerocode) harness driver.
 *
 * ZeroClaw is a Rust agent runtime; its `zerocode` TUI is for humans. We drive
 * the coding agent headlessly through `zeroclaw acp` — a JSON-RPC 2.0 server
 * over **stdio** (verified against v0.8.1: methods initialize, session/new,
 * session/prompt, session/stop; session/load for resume). There is no socket
 * daemon to manage. Each session step runs one ACP turn via a bundled bun client
 * (baked into the trial image at ZC.client):
 *
 *   initialize → session/new (cwd = workspace) → session/prompt → session/stop
 *
 * with the agent streaming `session/update` notifications (agent message chunks,
 * tool calls, usage) until the prompt response returns a `stopReason`. The client
 * echoes the wire transcript as JSONL; we redirect it to a sandbox-local file and
 * read it back in a separate exec — a service the agent starts can't hold the
 * capture open (the file-redirect rule the Claude Code / Codex drivers use).
 *
 * Auth is a ZeroClaw `auth` profile applied once per trial: the Claude Max
 * subscription token (`zeroclaw auth paste-token --auth-kind authorization`,
 * reusing CLAUDE_CODE_OAUTH_TOKEN — true Opus parity with Claude Code, no API
 * spend), else an Anthropic API key. Full-auto is set via `zeroclaw config set`
 * so no ACP turn blocks on an approval. ZeroClaw reports usage but NO billed USD,
 * so `costUsd` is 0 and run cost is resolved profile-priced/tokens-only.
 *
 * Subcommand/flag/config keys are pinned to ZeroClaw v0.8.1 and centralized in
 * ZC below; the ACP message parser is the stable, unit-tested contract.
 */

/**
 * ACP protocol version this driver speaks. Asserted against the server's
 * `initialize` handshake (verified === 1 on v0.8.1); a mismatch is an INFRA
 * failure (the trial is retried, not graded), because the candidate did nothing
 * wrong — the pinned ZeroClaw release drifted from the protocol we implement.
 * Re-pin deliberately alongside the image's ZeroClaw version (tasks 1.1/1.2).
 */
export const ACP_PROTOCOL_VERSION = 1;

/** Pinned-release-dependent invocation surface; verified against v0.8.1. */
const ZC = {
	bin: "zeroclaw",
	/** Bundled headless ACP stdio client (COPYed into the image). */
	client: "/opt/zeroclaw/acp-client.ts",
	/** Pre-built, secret-free trial config (agent + full-auto risk profile). */
	template: "/opt/zeroclaw/trial-config.toml",
	/** Per-trial, isolated config dir (lives in the trial's HOME). */
	configDir: '"$HOME/.zeroclaw"',
	/** Agent alias defined in the template; the ACP client names it in session/new. */
	agent: "trial",
	/** One-time setup marker so config copy/pin run once per trial, not per step. */
	marker: '"$HOME/.zeroclaw/.he-setup-done"',
	/**
	 * Env-override for the Anthropic provider credential (verified v0.8.1). Setting
	 * `ZEROCLAW_<dotted__path>` populates the config field at load — the ONLY
	 * headless credential path: auth-profiles authenticate the catalog but not
	 * generation, and the config secret field needs a TTY. ZeroClaw routes a
	 * `sk-ant-oat…` value as OAuth, so the Claude Max subscription token works here
	 * (no API spend); an `sk-ant-api…` key works too. Env-only — never baked.
	 */
	credEnv: "ZEROCLAW_providers__models__anthropic__anthropic__api_key",
};

/** Handshake-version / protocol failure: environmental, so it retries as infra. */
export class ZeroclawProtocolError extends InfraError {}

const runZeroclawAcp = createPrintCliSessionRunner({
	buildCommand: (opts) => {
		// Resume reuses the persistent ACP session id (ZeroClaw sessions persist by
		// design); absent on a new session / the first turn.
		const resume = opts.resumeSessionId
			? `--resume ${JSON.stringify(opts.resumeSessionId)}`
			: "";
		// Per-trial setup, run once (marker-gated): drop in the secret-free template
		// (defines the `trial` agent + a full-auto, sandbox-off risk profile with an
		// empty forbidden_paths so the workspace is writable), then pin the SAME
		// model id Claude Code receives (opts.model). `config set`/`models set` both
		// register the provider entry and set the default model; the observed model
		// echoes back in the ACP `initialize` _meta.defaultModel for post-hoc parity.
		const setup =
			`mkdir -p ${ZC.configDir}; ` +
			`if [ ! -f ${ZC.marker} ]; then ` +
			`cp ${ZC.template} ${ZC.configDir}/config.toml; ` +
			`${ZC.bin} config set providers.models.anthropic.anthropic.model ` +
			`${JSON.stringify(opts.model)} --config-dir ${ZC.configDir} > /dev/null 2>&1; ` +
			`${ZC.bin} models set ${JSON.stringify(opts.model)} ` +
			`--config-dir ${ZC.configDir} > /dev/null 2>&1 || true; ` +
			`touch ${ZC.marker}; ` +
			`fi`;
		// Credential via the env-override, exported INSIDE this shell so it reaches
		// the `zeroclaw acp` the client spawns (the "export inside bash -lc" rule).
		// Prefer the Max subscription token; fall back to an API key. The scheduler
		// blanks the unused one, so `${VAR:-…}` selects whichever is set.
		const cred =
			`export ${ZC.credEnv}="\${CLAUDE_CODE_OAUTH_TOKEN:-$ANTHROPIC_API_KEY}"`;
		// One ACP turn via the bundled stdio client; transcript JSONL → outFile.
		const turn = [
			"bun",
			ZC.client,
			`--prompt-file ${opts.promptFile}`,
			'--cwd "$PWD"',
			`--agent ${ZC.agent}`,
			`--protocol-version ${ACP_PROTOCOL_VERSION}`,
			`--config-dir ${ZC.configDir}`,
			resume,
			`> ${opts.outFile} 2>&1`,
		]
			.filter(Boolean)
			.join(" ");
		return [setup, cred, turn].join("; ");
	},
	parseOutput: parseZeroclawAcp,
});

export const zerocodeDriver: HarnessDriver = {
	id: "zerocode",
	runSession: runZeroclawAcp,
};

interface JsonRpc {
	id?: number | string;
	method?: string;
	result?: Record<string, unknown>;
	error?: Record<string, unknown>;
	params?: Record<string, unknown>;
}

function num(v: unknown): number {
	const n = Number(v ?? 0);
	return Number.isFinite(n) ? n : 0;
}

/**
 * Parse a ZeroClaw ACP JSONL exchange (one JSON-RPC 2.0 object per line) into
 * the common SessionRecord. Recognized shapes:
 *   {"id":0,"result":{"protocolVersion":1,...}}            initialize handshake
 *   {"id":1,"result":{"sessionId":"..."}}                  session/new
 *   {"method":"session/update","params":{"update":{
 *       "sessionUpdate":"agent_message_chunk","content":{"text":"..."}}}}
 *   {"method":"session/update","params":{"update":{
 *       "sessionUpdate":"tool_call","status":"completed",...}}}
 *   {"method":"session/update","params":{"update":{
 *       "sessionUpdate":"usage","tokens":{input,output,cacheRead}}}}
 *   {"id":2,"result":{"stopReason":"end_turn","_meta":{usage,numTurns,durationMs}}}
 *   {"id":N,"error":{...}}                                  any RPC error
 *
 * The `initialize` handshake version is asserted against ACP_PROTOCOL_VERSION;
 * a mismatch (or a missing handshake — the daemon never came up) throws
 * ZeroclawProtocolError, classified as infra. ZeroClaw reports no billed USD, so
 * costUsd is 0; duration is 0 unless the prompt result carries `_meta.durationMs`.
 */
export function parseZeroclawAcp(
	output: string,
	stepIndex: number,
	exitCode: number,
): DriverResult {
	let sessionId = "";
	let resultText = "";
	let handshakeVersion: number | null = null;
	let stopReason = "";
	let sawPromptResult = false;
	let sawError = false;
	let toolCalls = 0;
	let metaTurns: number | null = null;
	let durationMs = 0;
	let inputTokens = 0;
	let outputTokens = 0;
	let cacheReadTokens = 0;
	let cacheCreationTokens = 0;

	const readUsage = (u: Record<string, unknown> | undefined) => {
		if (!u) return;
		inputTokens += num(u.inputTokens ?? u.input_tokens);
		outputTokens += num(u.outputTokens ?? u.output_tokens);
		cacheReadTokens += num(u.cacheReadTokens ?? u.cache_read_tokens);
		cacheCreationTokens += num(
			u.cacheCreationTokens ?? u.cache_creation_tokens,
		);
	};

	const lines = output.split("\n").filter((l) => l.trim().startsWith("{"));
	for (const line of lines) {
		let msg: JsonRpc;
		try {
			msg = JSON.parse(line) as JsonRpc;
		} catch {
			continue; // non-JSON noise (daemon log lines, etc.)
		}
		if (msg.error) {
			sawError = true;
			continue;
		}
		// Responses (carry an id + result).
		if (msg.result && msg.id !== undefined) {
			const r = msg.result;
			if (typeof r.protocolVersion === "number" && handshakeVersion === null) {
				handshakeVersion = r.protocolVersion;
			}
			if (typeof r.sessionId === "string" && r.sessionId) {
				sessionId = r.sessionId;
			}
			if ("stopReason" in r) {
				sawPromptResult = true;
				stopReason = String(r.stopReason ?? "");
				const meta = (r._meta ?? {}) as Record<string, unknown>;
				readUsage(meta.usage as Record<string, unknown> | undefined);
				if (meta.numTurns !== undefined) metaTurns = num(meta.numTurns);
				if (meta.durationMs !== undefined) durationMs = num(meta.durationMs);
			}
			continue;
		}
		// Notifications (session/update stream).
		if (msg.method === "session/update") {
			const update = (msg.params?.update ?? {}) as Record<string, unknown>;
			switch (update.sessionUpdate) {
				case "agent_message_chunk": {
					const content = (update.content ?? {}) as Record<string, unknown>;
					if (typeof content.text === "string") resultText += content.text;
					break;
				}
				case "tool_call":
					if (update.status === "completed" || update.status === undefined) {
						toolCalls++;
					}
					break;
				case "usage":
					readUsage(update.tokens as Record<string, unknown> | undefined);
					break;
			}
		}
	}

	// Handshake assertion (infra, not candidate): the daemon must have come up and
	// spoken our protocol version. Absence ⇒ the daemon never initialized.
	if (handshakeVersion === null) {
		throw new ZeroclawProtocolError(
			`no ACP initialize handshake in ZeroClaw output (exit ${exitCode}); daemon may not have started. last 500 chars: ${output.slice(-500)}`,
		);
	}
	if (handshakeVersion !== ACP_PROTOCOL_VERSION) {
		throw new ZeroclawProtocolError(
			`ACP protocol version mismatch: daemon speaks ${handshakeVersion}, driver expects ${ACP_PROTOCOL_VERSION} — re-pin the ZeroClaw release/driver (infra failure, trial retried)`,
		);
	}
	// Handshake OK but the prompt turn never completed: a candidate-side stall
	// (graded as-is), mirroring the Codex driver's missing-terminal handling.
	if (!sawPromptResult && !sawError) {
		throw new SessionParseError(
			`ZeroClaw ACP turn produced no prompt result (exit ${exitCode}); last 500 chars: ${output.slice(-500)}`,
		);
	}

	const usage = TokenUsage.parse({
		inputTokens,
		outputTokens,
		cacheReadTokens,
		cacheCreationTokens,
	});
	const errorStop = /error|refus|cancel/i.test(stopReason);
	const record: SessionRecord = {
		sessionId,
		stepIndex,
		durationMs,
		numTurns: metaTurns ?? Math.max(1, toolCalls),
		costUsd: 0, // ZeroClaw reports no billed USD; resolved by cost-source rule
		usage,
		isError: sawError || errorStop || exitCode !== 0,
	};
	return { record, resultText, sessionId, transcript: output };
}

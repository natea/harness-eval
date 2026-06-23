import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	registerLiveSource,
	trialIdFromSandbox,
	unregisterLiveSource,
} from "../live/registry";
import { type SessionRecord, TokenUsage } from "../types";
import { SessionParseError } from "./claude";
import {
	type DriverResult,
	type HarnessDriver,
	InfraError,
	type RunDriverSession,
} from "./types";

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

/**
 * Env-override for the Anthropic provider credential (verified v0.8.1). Setting
 * `ZEROCLAW_<dotted__path>` populates the config field at load — the ONLY headless
 * credential path: auth-profiles authenticate the catalog but not generation, and
 * the config secret field needs a TTY. ZeroClaw routes a `sk-ant-oat…` value as
 * OAuth, so the Claude Max subscription token works here (no API spend); an
 * `sk-ant-api…` key works too. Env-only — never baked into the image.
 */
const CRED_ENV = "ZEROCLAW_providers__models__anthropic__anthropic__api_key";

/**
 * The bundled ACP client + secret-free trial config are shipped INTO the sandbox
 * at runtime (not referenced at a baked image path), so zerocode runs on ANY
 * provider/image: worktree (using the host's own `zeroclaw` on PATH) or any
 * docker/daytona image. Read once from the repo — the orchestrator host always
 * has them. The image's COPYs are now just a convenience, not a dependency.
 */
const CLIENT_SRC = readFileSync(
	join(import.meta.dir, "../../infra/trial-image/zeroclaw-acp-client.ts"),
	"utf8",
);
const CONFIG_SRC = readFileSync(
	join(import.meta.dir, "../../infra/trial-image/zeroclaw-trial-config.toml"),
	"utf8",
);

/** Handshake-version / protocol failure: environmental, so it retries as infra. */
export class ZeroclawProtocolError extends InfraError {}

/**
 * Drive one ACP turn. Ships the client + config into the sandbox, pins the model,
 * injects the credential via the env-override, and runs the bundled stdio client.
 * Uses a per-trial config dir under /tmp (NOT $HOME/.zeroclaw) so a worktree run
 * never clobbers the host's own ZeroClaw config, and concurrent worktree trials on
 * the shared host don't collide. Transcript JSONL → outFile, read back separately
 * (a service the agent starts can't hold the capture open); the outFile is tapped
 * for the studio live stream.
 */
const runZeroclawAcp: RunDriverSession = async (sandbox, run) => {
	const id = sandbox.id.replace(/[^a-zA-Z0-9_.-]/g, "_");
	const slot = `${id}-${run.stepIndex}`;
	const cfgDir = `/tmp/he-zc-${id}`;
	const clientFile = `/tmp/he-zc-client-${id}.ts`;
	const configSrcFile = `/tmp/he-zc-config-${id}.toml`;
	const promptFile = `/tmp/he-prompt-${slot}.txt`;
	const outFile = `/tmp/he-out-${slot}.jsonl`;

	// Ship the client + config + prompt into the sandbox (provider-agnostic).
	await sandbox.writeFile(clientFile, CLIENT_SRC);
	await sandbox.writeFile(configSrcFile, CONFIG_SRC);
	await sandbox.writeFile(promptFile, run.prompt);

	const resume = run.resumeSessionId
		? `--resume ${JSON.stringify(run.resumeSessionId)}`
		: "";
	// Install the config (defines the `trial` agent + a full-auto, sandbox-off risk
	// profile with empty forbidden_paths so the workspace is writable), pin the SAME
	// model id Claude Code gets (run.model — echoed back in _meta.defaultModel for
	// parity), inject the credential (Max token preferred; scheduler blanks the
	// unused one), then run one ACP turn naming the `trial` agent.
	const cmd = [
		`mkdir -p ${cfgDir}`,
		`cp ${configSrcFile} ${cfgDir}/config.toml`,
		`zeroclaw config set providers.models.anthropic.anthropic.model ${JSON.stringify(run.model)} --config-dir ${cfgDir} > /dev/null 2>&1`,
		`zeroclaw models set ${JSON.stringify(run.model)} --config-dir ${cfgDir} > /dev/null 2>&1 || true`,
		`export ${CRED_ENV}="\${CLAUDE_CODE_OAUTH_TOKEN:-$ANTHROPIC_API_KEY}"`,
		[
			"bun",
			clientFile,
			`--prompt-file ${promptFile}`,
			'--cwd "$PWD"',
			"--agent trial",
			`--protocol-version ${ACP_PROTOCOL_VERSION}`,
			`--config-dir ${cfgDir}`,
			resume,
			`> ${outFile} 2>&1`,
		]
			.filter(Boolean)
			.join(" "),
	].join("; ");

	// Live tap: drop a disk pointer so the studio can tail the transcript while the
	// build runs (host-local files only — worktree streams, container providers are
	// a push follow-up). Never affects the build.
	const trialId = trialIdFromSandbox(sandbox.id);
	registerLiveSource(trialId, {
		outFile,
		local: sandbox.id.startsWith("worktree:"),
		sandboxId: sandbox.id,
	});
	try {
		const res = await sandbox.exec(cmd, {
			timeoutMs: run.timeoutMs,
			env: run.env,
		});
		const read = await sandbox.exec(`cat ${outFile}`, { timeoutMs: 120_000 });
		return parseZeroclawAcp(read.stdout, run.stepIndex, res.exitCode);
	} finally {
		unregisterLiveSource(trialId);
	}
};

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

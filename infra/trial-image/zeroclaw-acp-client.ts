#!/usr/bin/env bun
/**
 * Headless ACP client for ZeroClaw (zerocode harness) trials.
 *
 * `zeroclaw acp` is a JSON-RPC 2.0 server over stdio (verified against ZeroClaw
 * v0.8.1: methods initialize, session/new, session/prompt, session/stop, with
 * session/load for resume). There is NO socket daemon to drive — we spawn the
 * ACP server and speak the protocol on its stdin/stdout. This client runs ONE
 * prompt turn and echoes every received wire message as JSONL to stdout, which
 * the harness redirects to the trial transcript file and parses
 * (`parseZeroclawAcp`). A started service therefore cannot hold the capture open
 * — the same file-redirect rule the Claude Code / Codex drivers use.
 *
 * Usage:
 *   bun acp-client.ts --prompt-file <f> [--cwd <dir>] [--resume <sessionId>]
 *                     [--protocol-version <n>] [--config-dir <dir>]
 *
 * Exit codes: 0 = turn completed (incl. agent-side error stopReason); non-zero =
 * client/protocol failure (handshake mismatch, spawn error, no terminal). The
 * harness parser independently asserts the handshake and turn terminal from the
 * echoed JSONL, so this exit code is a secondary signal.
 */

function arg(name: string): string | undefined {
	const i = process.argv.indexOf(`--${name}`);
	return i >= 0 ? process.argv[i + 1] : undefined;
}

const promptFile = arg("prompt-file");
if (!promptFile) {
	console.error("acp-client: --prompt-file is required");
	process.exit(2);
}
const cwd = arg("cwd") ?? process.cwd();
const resumeSessionId = arg("resume");
const protocolVersion = Number(arg("protocol-version") ?? 1);
const configDir = arg("config-dir");
// ZeroClaw requires session/new to name a configured agent alias
// (`[agents.<alias>]`); the driver creates one per trial.
const agentAlias = arg("agent");

const prompt = await Bun.file(promptFile).text();

const acpArgs = ["acp", "--max-sessions", "1"];
if (configDir) acpArgs.push("--config-dir", configDir);

const proc = Bun.spawn(["zeroclaw", ...acpArgs], {
	stdin: "pipe",
	stdout: "pipe",
	stderr: "pipe",
	// Pass our env through explicitly so the ACP server sees the provider
	// credentials (ANTHROPIC_OAUTH_TOKEN / ANTHROPIC_API_KEY) the driver exported.
	env: { ...process.env },
});

// Bun.spawn({stdin:"pipe"}) gives a FileSink (.write/.flush/.end), not a
// WritableStream — write line-delimited JSON-RPC and flush so the server sees it.
const stdin = proc.stdin;
const encoder = new TextEncoder();
let nextId = 0;
const pending = new Map<number, (msg: Record<string, unknown>) => void>();
let failed = false;

/** Send a JSON-RPC request and resolve with its matching response message. */
function request(method: string, params: unknown): Promise<Record<string, unknown>> {
	const id = nextId++;
	const line = `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`;
	return new Promise((resolve) => {
		pending.set(id, resolve);
		stdin.write(encoder.encode(line));
		stdin.flush();
	});
}

// Echo every received wire line verbatim (the transcript) and route responses by
// id; notifications (session/update, no id) just stream through to the echo.
(async () => {
	const decoder = new TextDecoder();
	let buf = "";
	for await (const chunk of proc.stdout as unknown as AsyncIterable<Uint8Array>) {
		buf += decoder.decode(chunk, { stream: true });
		let nl: number;
		while ((nl = buf.indexOf("\n")) >= 0) {
			const line = buf.slice(0, nl);
			buf = buf.slice(nl + 1);
			if (!line.trim()) continue;
			process.stdout.write(`${line}\n`); // echo to transcript
			try {
				const msg = JSON.parse(line) as Record<string, unknown>;
				if (typeof msg.id === "number" && pending.has(msg.id)) {
					const resolve = pending.get(msg.id);
					pending.delete(msg.id as number);
					resolve?.(msg);
				}
			} catch {
				// non-JSON line; already echoed
			}
		}
	}
})();

function resultOf(msg: Record<string, unknown>): Record<string, unknown> {
	return (msg.result ?? {}) as Record<string, unknown>;
}

try {
	// 1) Handshake — assert the protocol version the harness driver speaks.
	const init = await request("initialize", {
		protocolVersion,
		clientCapabilities: {},
	});
	const initRes = resultOf(init);
	if (init.error || initRes.protocolVersion !== protocolVersion) {
		console.error(
			`acp-client: handshake mismatch (got ${JSON.stringify(initRes.protocolVersion)}, want ${protocolVersion})`,
		);
		failed = true;
	}

	// 2) Session — new, or resume an existing one (ZeroClaw sessions persist).
	let sessionId = resumeSessionId ?? "";
	if (!failed) {
		const sessionParams: Record<string, unknown> = { cwd, mcpServers: [] };
		if (agentAlias) sessionParams.agentAlias = agentAlias;
		if (resumeSessionId) {
			await request("session/load", {
				...sessionParams,
				sessionId: resumeSessionId,
			});
		} else {
			const created = await request("session/new", sessionParams);
			sessionId = String(resultOf(created).sessionId ?? "");
			if (created.error || !sessionId) failed = true;
		}
	}

	// 3) Prompt turn — stream session/update notifications until the result.
	if (!failed) {
		await request("session/prompt", {
			sessionId,
			prompt: [{ type: "text", text: prompt }],
		});
		// 4) Best-effort close so the session frees server-side.
		await request("session/stop", { sessionId }).catch(() => {});
	}
} catch (err) {
	console.error(`acp-client: ${err}`);
	failed = true;
} finally {
	try {
		stdin.end();
	} catch {
		// sink already closed
	}
	proc.kill();
}

process.exit(failed ? 1 : 0);

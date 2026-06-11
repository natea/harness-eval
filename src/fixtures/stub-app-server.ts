#!/usr/bin/env bun
/**
 * Stub Codex app-server speaking the documented app-server protocol
 * (https://developers.openai.com/codex/app-server/): JSON-RPC-style JSONL
 * over stdio — requests carry `id`, notifications don't.
 *
 * Faithful surface:
 *   initialize -> result {userAgent}; expects `initialized` notification
 *   thread/start -> result {thread:{id,sessionId}} + thread/started notif
 *   thread/resume -> result {thread:{id}}
 *   turn/start -> result {turn:{id,status:inProgress}} then streamed
 *     notifications: turn/started, item/started, item/completed,
 *     thread/tokenUsage/updated, turn/completed
 * Liberality rule: any OTHER id-bearing request gets a generic `{ok:true}`
 * result (never starves a variant client), and every line is logged to
 * STUB_LOG_FILE so the evaluator can cite exactly which methods the
 * candidate spoke — protocol conformance is evidence, not a guess.
 *
 * Modes via STUB_MODE: normal | crash (exit 3 mid-turn) | stall (stop
 * responding after handshake) | approval (one requestApproval round-trip
 * before completing the turn).
 */

import { appendFileSync } from "node:fs";

const mode = process.env.STUB_MODE ?? "normal";
const logFile = process.env.STUB_LOG_FILE ?? "/tmp/stub-app-server.log";

function log(entry: Record<string, unknown>) {
	appendFileSync(
		logFile,
		`${JSON.stringify({ at: new Date().toISOString(), cwd: process.cwd(), pid: process.pid, ...entry })}\n`,
	);
}

function send(obj: Record<string, unknown>) {
	process.stdout.write(`${JSON.stringify(obj)}\n`);
}

const threadId = `thr_stub_${process.pid}`;
let turnCount = 0;
let initialized = false;
let stalled = false;

log({ event: "started", mode, argv: process.argv.slice(2) });

function streamTurn(id: unknown, turnId: string, input: unknown) {
	send({ method: "turn/started", params: { turn: { id: turnId, status: "inProgress" } } });
	send({
		method: "item/started",
		params: { item: { id: `item_${turnId}_1`, type: "agentMessage", text: "" } },
	});
	if (mode === "crash") {
		log({ event: "crashing-mid-turn" });
		process.exit(3);
	}
	if (mode === "approval") {
		send({
			method: "item/commandExecution/requestApproval",
			params: {
				itemId: `item_${turnId}_2`,
				threadId,
				turnId,
				command: "echo stub-approval-probe",
				reason: "stub approval-flow exercise",
			},
		});
		// Completion continues when the client answers (handled in dispatch).
		pendingApprovalTurn = { id, turnId };
		return;
	}
	completeTurn(id, turnId);
}

let pendingApprovalTurn: { id: unknown; turnId: string } | null = null;

function completeTurn(id: unknown, turnId: string) {
	send({
		method: "item/completed",
		params: {
			item: {
				id: `item_${turnId}_1`,
				type: "agentMessage",
				phase: "final_answer",
				text: `stub completed turn ${turnCount}`,
			},
		},
	});
	send({
		method: "thread/tokenUsage/updated",
		params: {
			threadId,
			usage: { inputTokens: 1200, outputTokens: 340, totalTokens: 1540 },
		},
	});
	send({ method: "turn/completed", params: { turn: { id: turnId, status: "completed" } } });
	if (mode === "normal" && turnCount >= 1) {
		// Stay alive briefly for continuation turns (spec 10.3), then exit clean.
		log({ event: "turn-complete-idle" });
	}
}

function dispatch(msg: Record<string, unknown>) {
	const id = "id" in msg ? msg.id : undefined;
	const method = String(msg.method ?? "");
	const params = (msg.params ?? {}) as Record<string, unknown>;

	// Approval responses come back as plain results referencing our request.
	if (pendingApprovalTurn && !method) {
		const decision = JSON.stringify(msg).toLowerCase();
		log({ event: "approval-response", accepted: decision.includes("accept") });
		const t = pendingApprovalTurn;
		pendingApprovalTurn = null;
		completeTurn(t.id, t.turnId);
		return;
	}

	switch (method) {
		case "initialize":
			initialized = true;
			send({
				id,
				result: {
					userAgent: { name: "stub-app-server", version: "1.0.0" },
					platform: "linux",
				},
			});
			return;
		case "initialized":
			log({ event: "initialized-notification" });
			if (mode === "stall") {
				stalled = true;
				log({ event: "stalling" });
			}
			return;
		case "thread/start":
		case "thread/resume": {
			send({ id, result: { thread: { id: threadId, sessionId: threadId } } });
			send({ method: "thread/started", params: { thread: { id: threadId } } });
			log({ event: method, cwd: params.cwd, approvalPolicy: params.approvalPolicy });
			return;
		}
		case "turn/start": {
			turnCount++;
			const turnId = `turn_stub_${turnCount}`;
			send({ id, result: { turn: { id: turnId, status: "inProgress", items: [] } } });
			log({ event: "turn/start", turn: turnCount, input: JSON.stringify(params.input).slice(0, 500), cwd: params.cwd });
			streamTurn(id, turnId, params.input);
			return;
		}
		case "turn/interrupt":
			send({ id, result: {} });
			send({
				method: "turn/completed",
				params: { turn: { id: `turn_stub_${turnCount}`, status: "interrupted" } },
			});
			return;
		default:
			// Liberality: never starve an id-bearing request, even unknown
			// methods — but the log preserves what was actually spoken.
			log({ event: "unknown-method", method, hadId: id !== undefined });
			if (id !== undefined) {
				send({ id, result: { ok: true, note: `stub: unrecognized method ${method}` } });
			}
	}
}

process.stdin.setEncoding("utf8");
let buffer = "";
process.stdin.on("data", (chunk: string) => {
	buffer += chunk;
	let nl = buffer.indexOf("\n");
	while (nl !== -1) {
		const line = buffer.slice(0, nl).trim();
		buffer = buffer.slice(nl + 1);
		nl = buffer.indexOf("\n");
		if (!line) continue;
		let msg: Record<string, unknown>;
		try {
			msg = JSON.parse(line) as Record<string, unknown>;
		} catch {
			log({ event: "non-json-line", line: line.slice(0, 500) });
			continue;
		}
		log({ event: "received", msg });
		if (stalled) continue;
		if (!initialized && msg.method !== "initialize") {
			// Documented behavior: pre-handshake requests error.
			if ("id" in msg) send({ id: msg.id, error: { code: -32002, message: "Not initialized" } });
			continue;
		}
		dispatch(msg);
	}
});

process.stdin.on("end", () => {
	log({ event: "stdin-closed" });
	process.exit(0);
});

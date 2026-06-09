#!/usr/bin/env bun
/**
 * Stub coding-agent app-server speaking a JSON-line protocol over
 * stdin/stdout (task 6.2, per Symphony §10/§17.5). Used as `codex.command`
 * during functional evaluation so candidate Symphony implementations can be
 * exercised without a real coding agent.
 *
 * Behavior is controlled by STUB_MODE:
 *   normal (default) — handshake, a few agent events with usage, clean exit
 *   crash            — exit(3) mid-turn (abnormal exit → backoff retry path)
 *   stall            — stop responding after handshake (timeout path)
 *
 * Evidence: every received line is appended to STUB_LOG_FILE (default
 * /tmp/stub-app-server.log) with cwd and timestamps, so the evaluator can
 * verify launch cwd, prompt rendering, and protocol traffic.
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

log({ event: "started", mode, argv: process.argv.slice(2) });

let turnCount = 0;
let stalled = false;
let handshaken = false;

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
    handle(msg);
  }
});

function handle(msg: Record<string, unknown>) {
  const id = msg.id ?? null;
  const method = String(msg.method ?? msg.type ?? "");

  // Generic handshake: respond to the first initialize/start-shaped request.
  if (!handshaken && (/initialize|session|start|thread/i.test(method) || true)) {
    handshaken = true;
    send({ id, result: { session_id: `stub-${process.pid}`, thread_id: `thread-${process.pid}` } });
    send({ type: "session_started", session_id: `stub-${process.pid}` });
    if (mode === "stall") {
      stalled = true;
      log({ event: "stalling" });
      return;
    }
  }

  if (/turn|prompt|input|message/i.test(method)) {
    turnCount++;
    if (mode === "crash") {
      log({ event: "crashing" });
      process.exit(3);
    }
    send({ type: "agent_event", event: "task_started", turn: turnCount });
    send({
      type: "usage",
      usage: { input_tokens: 1200, output_tokens: 340, total_tokens: 1540 },
      rate_limits: { remaining: 99 },
    });
    send({ type: "agent_event", event: "task_completed", turn: turnCount });
    send({ id, result: { status: "completed", turn: turnCount } });
    if (mode === "normal" && turnCount >= 1) {
      log({ event: "normal-exit" });
      setTimeout(() => process.exit(0), 100);
    }
  }
}

process.stdin.on("end", () => {
  log({ event: "stdin-closed" });
  process.exit(0);
});

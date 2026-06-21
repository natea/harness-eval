import { describe, expect, test } from "bun:test";
import { LiveTurnStream, type LineReader, sandboxLineReader } from "../src/live/tap";
import { parseTranscript } from "../src/report/transcript-render";
import type { ExecOptions, ExecResult, Sandbox } from "../src/providers/types";

/**
 * Live build stream — core tap pipeline (add-live-build-stream). Pure, no spend:
 * a fake LineReader replays a growing session file line-by-line (incl. a partial
 * trailing line) and we assert the streamed turns equal the post-hoc render, that
 * partial lines are buffered, and that secrets are redacted live.
 */

// A growing file: `feed` appends raw text; `read(fromLine)` returns lines from the
// 1-indexed start to EOF (mirrors `tail -n +N`, partial trailing line included).
function growingReader(): LineReader & { feed: (s: string) => void } {
	let buf = "";
	return {
		feed(s: string) {
			buf += s;
		},
		async read(fromLine: number): Promise<string> {
			const lines = buf.split("\n");
			// Reassemble from the (fromLine-1)th line to the end, preserving whether
			// the buffer currently ends mid-line.
			const tail = lines.slice(fromLine - 1).join("\n");
			return tail;
		},
	};
}

const CLAUDE = [
	`{"type":"system","subtype":"init","session_id":"s1","model":"m","cwd":"/w","tools":["Bash"]}`,
	`{"type":"assistant","session_id":"s1","message":{"role":"assistant","content":[{"type":"text","text":"Working on it."}]}}`,
	`{"type":"result","subtype":"success","is_error":false,"duration_ms":10,"num_turns":1,"total_cost_usd":0.01,"session_id":"s1","result":"done","usage":{"input_tokens":5,"output_tokens":2}}`,
];

describe("live-build-stream: LiveTurnStream", () => {
	test("streams turns incrementally and buffers a partial trailing line", async () => {
		const [L0, L1, L2] = CLAUDE as [string, string, string];
		const r = growingReader();
		const s = new LiveTurnStream(r, []);

		// First line only → init turn.
		r.feed(`${L0}\n`);
		let fresh = await s.poll();
		expect(fresh.map((t) => t.kind)).toEqual(["init"]);

		// A PARTIAL second line (no newline yet) → nothing new emitted.
		r.feed(L1.slice(0, 40));
		fresh = await s.poll();
		expect(fresh).toEqual([]);

		// Complete the line → the assistant turn now appears (buffered until newline).
		r.feed(`${L1.slice(40)}\n`);
		fresh = await s.poll();
		expect(fresh.map((t) => t.kind)).toEqual(["assistant"]);

		// Final result line.
		r.feed(`${L2}\n`);
		fresh = await s.poll();
		expect(fresh.map((t) => t.kind)).toEqual(["result"]);

		// No more output → no new turns.
		expect(await s.poll()).toEqual([]);
	});

	test("accumulated live turns equal the post-hoc render", async () => {
		const full = `${CLAUDE.join("\n")}\n`;
		const r = growingReader();
		const s = new LiveTurnStream(r, []);
		const collected: string[] = [];
		// Feed one byte-chunk at a time to stress partial-line handling.
		for (const ch of full) {
			r.feed(ch);
			for (const t of await s.poll()) collected.push(t.kind);
		}
		expect(collected).toEqual(parseTranscript(full).map((t) => t.kind));
	});

	test("redacts secrets in streamed turns", async () => {
		const secret = "sk-supersecretvalue1234567890";
		const line = `{"type":"assistant","session_id":"s","message":{"role":"assistant","content":[{"type":"text","text":"key is ${secret}"}]}}\n`;
		const r = growingReader();
		const s = new LiveTurnStream(r, [secret]);
		r.feed(line);
		const fresh = await s.poll();
		const text = JSON.stringify(fresh);
		expect(text).not.toContain(secret);
		expect(text).toContain("[REDACTED:secret]");
	});

	test("codex format streams through the same path", async () => {
		const codex = [
			`{"type":"thread.started","thread_id":"th"}`,
			`{"type":"turn.started"}`,
			`{"type":"item.completed","item":{"id":"i","type":"agent_message","text":"built it"}}`,
			`{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}`,
		];
		const r = growingReader();
		const s = new LiveTurnStream(r, []);
		r.feed(`${codex.join("\n")}\n`);
		const kinds = (await s.poll()).map((t) => t.kind);
		expect(kinds).toEqual(["assistant", "result"]);
	});
});

describe("live-build-stream: sandboxLineReader is read-only", () => {
	test("only execs a read (tail); never writes the sandbox", async () => {
		const execs: string[] = [];
		let wrote = false;
		const sandbox: Sandbox = {
			id: "worktree:t1",
			workspacePath: "/w",
			async exec(command: string, _opts?: ExecOptions): Promise<ExecResult> {
				execs.push(command);
				return { exitCode: 0, stdout: "line1\nline2\n", stderr: "" };
			},
			async copyOut() {},
			async writeFile() {
				wrote = true;
			},
			async destroy() {},
		};
		const reader = sandboxLineReader(sandbox, "/tmp/he-out-x.jsonl");
		const out = await reader.read(1);
		expect(out).toBe("line1\nline2\n");
		expect(wrote).toBe(false);
		expect(execs).toHaveLength(1);
		expect(execs[0]).toMatch(/^tail -n \+1 /);
		expect(execs[0]).not.toMatch(/tail -f/); // short-lived; never holds stdout
	});
});

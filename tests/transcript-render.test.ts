import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { archiveTrial } from "../src/driver/archive";
import type { Sandbox } from "../src/providers/types";
import {
	MAX_INLINE,
	parseTranscript,
	renderMarkdown,
	renderTrial,
} from "../src/report/transcript-render";

/** A compact but representative stream-json session. */
function fixture(): string {
	return [
		JSON.stringify({
			type: "system",
			subtype: "init",
			model: "claude-opus-4-6",
			cwd: "/ws",
			tools: ["Read", "Bash", "Edit"],
			session_id: "s1",
		}),
		// bootstrap noise that MUST be dropped
		JSON.stringify({ type: "system", subtype: "hook", hook_name: "x" }),
		JSON.stringify({ type: "rate_limit_event", rate_limit_info: {} }),
		// assistant text + a tool call (request)
		JSON.stringify({
			type: "assistant",
			message: {
				role: "assistant",
				content: [
					{ type: "thinking", thinking: "let me look", signature: "z" },
					{ type: "text", text: "Reading the spec." },
					{
						type: "tool_use",
						id: "tu_1",
						name: "Read",
						input: { file_path: "/ws/SPEC.md" },
					},
				],
			},
		}),
		// tool result (response) for tu_1
		JSON.stringify({
			type: "user",
			message: {
				role: "user",
				content: [
					{ type: "tool_result", tool_use_id: "tu_1", content: "spec body" },
				],
			},
		}),
		// an errored tool result
		JSON.stringify({
			type: "assistant",
			message: {
				role: "assistant",
				content: [
					{ type: "tool_use", id: "tu_2", name: "Bash", input: { cmd: "ls" } },
				],
			},
		}),
		JSON.stringify({
			type: "user",
			message: {
				role: "user",
				content: [
					{
						type: "tool_result",
						tool_use_id: "tu_2",
						is_error: true,
						content: [{ type: "text", text: "boom" }],
					},
				],
			},
		}),
		JSON.stringify({
			type: "result",
			subtype: "success",
			is_error: false,
			duration_ms: 12000,
			total_cost_usd: 0.42,
			num_turns: 3,
			usage: { input_tokens: 100, output_tokens: 50 },
		}),
		"not json noise",
		"",
	].join("\n");
}

describe("transcript-render: parseTranscript (task 1.1)", () => {
	const turns = parseTranscript(fixture());

	test("excludes bootstrap system + rate-limit noise, keeps init as header", () => {
		expect(turns.filter((t) => t.kind === "init")).toHaveLength(1);
		const init = turns.find((t) => t.kind === "init");
		expect(init).toMatchObject({ model: "claude-opus-4-6", cwd: "/ws" });
		// no raw "system"/"rate_limit_event" turns leak through
		expect(turns.some((t) => (t as { kind: string }).kind === "system")).toBe(
			false,
		);
	});

	test("tool_use is a request, tool_result a response, linked by id + tool name", () => {
		const use = turns.find((t) => t.kind === "tool_use");
		const res = turns.find((t) => t.kind === "tool_result");
		expect(use).toMatchObject({ dir: "request", tool: "Read", id: "tu_1" });
		// the result inherits the call's tool name via id pairing
		expect(res).toMatchObject({
			dir: "response",
			forId: "tu_1",
			tool: "Read",
			isError: false,
		});
	});

	test("preserves original order (text → request → response)", () => {
		const kinds = turns.map((t) => t.kind);
		const iText = kinds.indexOf("assistant");
		const iUse = kinds.indexOf("tool_use");
		const iRes = kinds.indexOf("tool_result");
		expect(iText).toBeLessThan(iUse);
		expect(iUse).toBeLessThan(iRes);
	});

	test("surfaces tool errors and array-form result content", () => {
		const errored = turns.find(
			(t) => t.kind === "tool_result" && t.forId === "tu_2",
		);
		expect(errored).toMatchObject({ isError: true, output: "boom" });
	});

	test("captures the terminal result with cost/usage", () => {
		const result = turns.find((t) => t.kind === "result");
		expect(result).toMatchObject({
			status: "success",
			costUsd: 0.42,
			numTurns: 3,
		});
	});
});

describe("transcript-render: Codex exec --json format (add-codex-cli-harness)", () => {
	const codexJsonl = [
		JSON.stringify({ type: "thread.started", thread_id: "th-1" }),
		JSON.stringify({ type: "turn.started" }),
		JSON.stringify({
			type: "item.completed",
			item: { id: "i0", type: "reasoning", text: "Plan the service." },
		}),
		JSON.stringify({
			type: "item.completed",
			item: { id: "i1", type: "command_execution", command: "ls", aggregated_output: "SPEC.md", exit_code: 0 },
		}),
		JSON.stringify({
			type: "item.completed",
			item: { id: "i2", type: "file_change", changes: [{ path: "server.js", kind: "add" }] },
		}),
		JSON.stringify({
			type: "item.completed",
			item: { id: "i3", type: "agent_message", text: "Built the notes service." },
		}),
		JSON.stringify({
			type: "turn.completed",
			usage: { input_tokens: 100, cached_input_tokens: 40, output_tokens: 20 },
		}),
	].join("\n");

	test("dispatches to the codex parser and maps items to turns", () => {
		const turns = parseTranscript(codexJsonl);
		const kinds = turns.map((t) => t.kind);
		expect(kinds).toEqual([
			"thinking",
			"tool_use",
			"tool_result",
			"tool_use",
			"assistant",
			"result",
		]);
	});

	test("command output, file_change, agent_message, and result are captured", () => {
		const turns = parseTranscript(codexJsonl);
		const cmd = turns.find((t) => t.kind === "tool_use" && t.tool === "command");
		expect(cmd).toBeDefined();
		const out = turns.find((t) => t.kind === "tool_result");
		expect(out).toMatchObject({ tool: "command", isError: false });
		const msg = turns.find((t) => t.kind === "assistant");
		expect(msg).toMatchObject({ text: "Built the notes service." });
		const result = turns.find((t) => t.kind === "result");
		expect(result).toMatchObject({ status: "success", numTurns: 1 });
		expect((result as { usage: { inputTokens: number } }).usage.inputTokens).toBe(100);
	});

	test("turn.failed renders an error result + message", () => {
		const failed = [
			JSON.stringify({ type: "thread.started", thread_id: "th-2" }),
			JSON.stringify({ type: "turn.started" }),
			JSON.stringify({ type: "turn.failed", error: { message: "401 Unauthorized" } }),
		].join("\n");
		const turns = parseTranscript(failed);
		expect(turns.find((t) => t.kind === "result")).toMatchObject({ status: "error" });
		expect(turns.some((t) => t.kind === "assistant" && t.text.includes("401"))).toBe(true);
	});
});

describe("transcript-render: renderMarkdown (task 1.2)", () => {
	test("labels request/response distinctly and truncates oversized payloads", () => {
		const big = "x".repeat(MAX_INLINE + 5000);
		const turns = parseTranscript(
			[
				JSON.stringify({
					type: "user",
					message: {
						role: "user",
						content: [{ type: "tool_result", tool_use_id: "t", content: big }],
					},
				}),
			].join("\n"),
		);
		const md = renderMarkdown(turns, "session-000.jsonl");
		expect(md).toContain("← RESPONSE");
		expect(md).toMatch(/elided — see session-000\.jsonl/);
		// the marker means we did NOT inline the whole payload
		expect(md.length).toBeLessThan(big.length);
	});

	test("renders a typed user prompt as a request turn", () => {
		const turns = parseTranscript(
			JSON.stringify({
				type: "user",
				message: { role: "user", content: "build the thing" },
			}),
		);
		expect(turns[0]).toMatchObject({ kind: "prompt", dir: "request" });
		expect(renderMarkdown(turns)).toContain("▶ PROMPT");
	});
});

describe("transcript-render: renderTrial (task 1.3)", () => {
	test("concatenates multiple sessions under ordered headings", () => {
		const dir = mkdtempSync(join(tmpdir(), "trial-"));
		const tdir = join(dir, "transcripts");
		mkdirSync(tdir, { recursive: true });
		writeFileSync(join(tdir, "session-000.jsonl"), fixture());
		writeFileSync(join(tdir, "session-001.jsonl"), fixture());
		const r = renderTrial(dir);
		expect(r.sessions).toHaveLength(2);
		expect(r.conversationMd).toContain("## Session 0 — session-000.jsonl");
		expect(r.conversationMd).toContain("## Session 1 — session-001.jsonl");
		// ground-truth disclaimer present
		expect(r.conversationMd).toContain("unabridged ground truth");
	});
});

describe("transcript-render: archive emission + redaction (tasks 2.1, 2.2)", () => {
	test("archiveTrial emits conversation.md with NO raw secret (renderer is downstream of redaction)", async () => {
		const SECRET = "lin_api_supersecretvalue_xyz";
		const prior = process.env.LINEAR_API_KEY;
		process.env.LINEAR_API_KEY = SECRET;
		try {
			const trialDir = mkdtempSync(join(tmpdir(), "arch-trial-"));
			// A transcript whose tool result leaks the secret value verbatim.
			const transcript = [
				JSON.stringify({
					type: "assistant",
					message: {
						role: "assistant",
						content: [
							{ type: "tool_use", id: "tu_1", name: "Bash", input: { cmd: "env" } },
						],
					},
				}),
				JSON.stringify({
					type: "user",
					message: {
						role: "user",
						content: [
							{
								type: "tool_result",
								tool_use_id: "tu_1",
								content: `LINEAR_API_KEY=${SECRET}`,
							},
						],
					},
				}),
				JSON.stringify({ type: "result", subtype: "success", duration_ms: 1, total_cost_usd: 0, num_turns: 1, usage: {} }),
			].join("\n");

			// Minimal sandbox: copyOut just creates the (empty) workspace dir.
			const sandbox = {
				id: "t",
				workspacePath: "/ws",
				async exec() {
					return { exitCode: 0, stdout: "", stderr: "" };
				},
				async copyOut(_src: string, dest: string) {
					mkdirSync(dest, { recursive: true });
				},
				async writeFile() {},
				async destroy() {},
			} as unknown as Sandbox;

			const res = await archiveTrial(sandbox, trialDir, [transcript]);
			expect(res.redactions).toBeGreaterThan(0);

			const convo = readFileSync(
				join(trialDir, "transcripts", "conversation.md"),
				"utf8",
			);
			// The readable artifact must NOT contain the raw secret...
			expect(convo).not.toContain(SECRET);
			// ...because it derives from the already-redacted .jsonl.
			expect(convo).toContain("[REDACTED:secret]");
			// per-session Markdown is emitted too
			expect(
				readFileSync(join(trialDir, "transcripts", "session-000.md"), "utf8"),
			).not.toContain(SECRET);
		} finally {
			if (prior === undefined) delete process.env.LINEAR_API_KEY;
			else process.env.LINEAR_API_KEY = prior;
		}
	});
});

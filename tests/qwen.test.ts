import { describe, expect, test } from "bun:test";
import { getHarnessDriver, runnableHarnessIds } from "../src/driver";
import { SessionParseError } from "../src/driver/claude";
import { parseQwenStreamJson, qwenCodeDriver } from "../src/driver/qwen";
import { harnessReportsCost, loadHarnesses } from "../src/harnesses";
import type { ExecOptions, ExecResult, Sandbox } from "../src/providers/types";
import { loadRegistry, resolveCandidates } from "../src/registry";

class FakeSandbox implements Sandbox {
	readonly workspacePath = "/workspace";
	readonly writes: { path: string; content: string }[] = [];
	readonly execs: { command: string; opts?: ExecOptions }[] = [];
	constructor(
		readonly id: string,
		private readonly transcript: string,
	) {}
	async exec(command: string, opts?: ExecOptions): Promise<ExecResult> {
		this.execs.push({ command, opts });
		if (command.startsWith("cat /tmp/he-out-")) {
			return { exitCode: 0, stdout: this.transcript, stderr: "" };
		}
		return { exitCode: 0, stdout: "", stderr: "" };
	}
	async copyOut(): Promise<void> {}
	async writeFile(path: string, content: string): Promise<void> {
		this.writes.push({ path, content });
	}
	async destroy(): Promise<void> {}
}

const result = (over: Record<string, unknown> = {}) =>
	JSON.stringify({
		type: "result",
		subtype: "success",
		session_id: "qwen-1",
		is_error: false,
		duration_ms: 65000,
		num_turns: 3,
		result: "done",
		usage: {
			input_tokens: 1200,
			output_tokens: 450,
			cache_read_input_tokens: 100,
			cache_creation_input_tokens: 50,
		},
		...over,
	});

describe("qwen-code stream-json parsing", () => {
	test("parses session id, result text, usage, turns, duration", () => {
		const out = [
			JSON.stringify({
				type: "system",
				subtype: "session_start",
				session_id: "qwen-1",
			}),
			JSON.stringify({ type: "assistant", session_id: "qwen-1" }),
			result(),
		].join("\n");
		const r = parseQwenStreamJson(out, 0, 0);
		expect(r.sessionId).toBe("qwen-1");
		expect(r.resultText).toBe("done");
		expect(r.record.durationMs).toBe(65000);
		expect(r.record.numTurns).toBe(3);
		expect(r.record.usage.inputTokens).toBe(1200);
		expect(r.record.usage.outputTokens).toBe(450);
		expect(r.record.usage.cacheReadTokens).toBe(100);
		expect(r.record.usage.cacheCreationTokens).toBe(50);
		expect(r.record.costUsd).toBe(0); // Qwen reports no billed USD
		expect(r.record.isError).toBe(false);
	});

	test("falls back to assistant-message count when num_turns is absent", () => {
		const out = [
			JSON.stringify({ type: "assistant", session_id: "qwen-2" }),
			JSON.stringify({ type: "assistant", session_id: "qwen-2" }),
			result({ num_turns: undefined }),
		].join("\n");
		expect(parseQwenStreamJson(out, 0, 0).record.numTurns).toBe(2);
	});

	test("missing result → candidate-side parse error", () => {
		const out = JSON.stringify({ type: "system", session_id: "qwen-3" });
		expect(() => parseQwenStreamJson(out, 0, 0)).toThrow(SessionParseError);
	});

	test("result.is_error or non-zero exit marks the record errored", () => {
		expect(
			parseQwenStreamJson(result({ is_error: true }), 0, 0).record.isError,
		).toBe(true);
		expect(parseQwenStreamJson(result(), 0, 1).record.isError).toBe(true);
	});
});

describe("qwen-code driver wiring", () => {
	test("registered, selectable, and id matches", () => {
		expect(runnableHarnessIds()).toContain("qwen-code");
		expect(getHarnessDriver("qwen-code").id).toBe("qwen-code");
		expect(qwenCodeDriver.id).toBe("qwen-code");
	});

	test("runs `qwen -p --output-format stream-json --yolo` with the prompt unmutated", async () => {
		const sandbox = new FakeSandbox(
			"trial.qw-1",
			result({ session_id: "qwen-8" }),
		);
		const r = await qwenCodeDriver.runSession(sandbox, {
			model: "qwen3-coder-plus",
			prompt: "BUILD IT",
			stepIndex: 0,
			timeoutMs: 600_000,
			env: { OPENAI_API_KEY: "key", OPENAI_BASE_URL: "https://x/v1" },
		});
		const prompt = sandbox.writes.find((w) =>
			w.path.startsWith("/tmp/he-prompt-"),
		);
		expect(prompt?.content).toBe("BUILD IT");
		const runCmd = sandbox.execs[0]?.command ?? "";
		expect(runCmd).toContain("qwen");
		expect(runCmd).toContain("--prompt");
		expect(runCmd).toContain('"$(cat /tmp/he-prompt-');
		expect(runCmd).toContain("--output-format stream-json");
		expect(runCmd).toContain("--yolo");
		expect(runCmd).toContain('--model "qwen3-coder-plus"');
		expect(runCmd).not.toContain("--resume"); // first turn: no resume
		expect(sandbox.execs.at(-1)?.command.startsWith("cat /tmp/he-out-")).toBe(
			true,
		);
		expect(r.sessionId).toBe("qwen-8");
	});

	test("resume reuses the session id via --resume", async () => {
		const sandbox = new FakeSandbox("trial.qw-2", result());
		await qwenCodeDriver.runSession(sandbox, {
			model: "m",
			prompt: "continue",
			stepIndex: 1,
			resumeSessionId: "prev-sess",
			timeoutMs: 1000,
		});
		expect(sandbox.execs[0]?.command).toContain('--resume "prev-sess"');
	});
});

describe("qwen-code registry + cost wiring", () => {
	test("bare resolves on qwen-code; frameworks without a section fail", () => {
		const registry = loadRegistry("config/registry.yaml");
		const harnesses = loadHarnesses();
		const bare = resolveCandidates(registry, ["bare"], "qwen-code", harnesses);
		expect(bare[0]?.id).toBe("bare");
		expect(bare[0]?.harnesses["qwen-code"]?.install).toEqual([]);
		expect(() =>
			resolveCandidates(registry, ["superpowers"], "qwen-code", harnesses),
		).toThrow(/qwen-code/);
	});

	test("qwen-code reports no billed USD → tokens-only cost source", () => {
		expect(harnessReportsCost("qwen-code")).toBe(false);
	});
});

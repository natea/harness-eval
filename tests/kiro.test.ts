import { describe, expect, test } from "bun:test";
import { getHarnessDriver, runnableHarnessIds } from "../src/driver";
import { SessionParseError } from "../src/driver/claude";
import { kiroDriver, parseKiroStreamJson } from "../src/driver/kiro";
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

const ev = {
	started: (sid = "kiro-1") =>
		JSON.stringify({ type: "runStarted", data: { sessionId: sid } }),
	chunk: (text: string, sid = "kiro-1") =>
		JSON.stringify({
			type: "sessionUpdate",
			data: {
				sessionId: sid,
				update: { sessionUpdate: "agent_message_chunk", content: { text } },
			},
		}),
	tool: (sid = "kiro-1") =>
		JSON.stringify({
			type: "sessionUpdate",
			data: {
				sessionId: sid,
				update: { sessionUpdate: "tool_call", status: "completed" },
			},
		}),
	metadata: (turnMs = 1000, sid = "kiro-1") =>
		JSON.stringify({
			type: "metadata",
			data: {
				sessionId: sid,
				meteringUsage: { credits: 1 },
				turnDurationMs: turnMs,
			},
		}),
	finished: (status = "success", sid = "kiro-1") =>
		JSON.stringify({
			type: "runFinished",
			data: { sessionId: sid, status, stopReason: "end_turn" },
		}),
	error: (sid = "kiro-1") =>
		JSON.stringify({
			type: "error",
			data: { sessionId: sid, message: "boom" },
		}),
	usage: (input: number, output: number, sid = "kiro-1") =>
		JSON.stringify({
			type: "usage",
			data: {
				sessionId: sid,
				tokenUsage: { inputTokens: input, outputTokens: output },
			},
		}),
};

describe("kiro stream-json parsing", () => {
	test("parses session id, text, duration, turns", () => {
		const out = [
			ev.started(),
			ev.chunk("Planning "),
			ev.tool(),
			ev.chunk("and building."),
			ev.metadata(42000),
			ev.finished(),
		].join("\n");
		const r = parseKiroStreamJson(out, 0, 0);
		expect(r.sessionId).toBe("kiro-1");
		expect(r.resultText).toBe("Planning \nand building.");
		expect(r.record.durationMs).toBe(42000);
		expect(r.record.numTurns).toBe(1);
		expect(r.record.costUsd).toBe(0); // metering credits, not USD
		expect(r.record.usage.inputTokens).toBe(0);
		expect(r.record.isError).toBe(false);
	});

	test("accumulates token usage when a usage event is present", () => {
		const out = [ev.started(), ev.usage(1200, 800), ev.finished()].join("\n");
		const r = parseKiroStreamJson(out, 0, 0);
		expect(r.record.usage.inputTokens).toBe(1200);
		expect(r.record.usage.outputTokens).toBe(800);
	});

	test("an error event marks the record errored", () => {
		const out = [ev.started(), ev.error()].join("\n");
		expect(parseKiroStreamJson(out, 0, 0).record.isError).toBe(true);
	});

	test("a failed runFinished status marks the record errored", () => {
		const out = [ev.started(), ev.finished("failed")].join("\n");
		expect(parseKiroStreamJson(out, 0, 0).record.isError).toBe(true);
	});

	test("non-zero exit marks the record errored", () => {
		const out = [ev.started(), ev.finished()].join("\n");
		expect(parseKiroStreamJson(out, 0, 1).record.isError).toBe(true);
	});

	test("no runFinished and no error → candidate-side parse error", () => {
		const out = [ev.started(), ev.chunk("hi")].join("\n");
		expect(() => parseKiroStreamJson(out, 0, 0)).toThrow(SessionParseError);
	});
});

describe("kiro driver wiring", () => {
	test("registered, selectable, and id matches", () => {
		expect(runnableHarnessIds()).toContain("kiro");
		expect(getHarnessDriver("kiro").id).toBe("kiro");
		expect(kiroDriver.id).toBe("kiro");
	});

	test("runs `kiro-cli chat --no-interactive --trust-all-tools --output-format stream-json`", async () => {
		const sandbox = new FakeSandbox(
			"trial.ki-1",
			[ev.started("kiro-8"), ev.finished("success", "kiro-8")].join("\n"),
		);
		const r = await kiroDriver.runSession(sandbox, {
			model: "claude-sonnet-4.5",
			prompt: "BUILD IT",
			stepIndex: 0,
			timeoutMs: 600_000,
			env: { KIRO_API_KEY: "key" },
		});
		const prompt = sandbox.writes.find((w) =>
			w.path.startsWith("/tmp/he-prompt-"),
		);
		expect(prompt?.content).toBe("BUILD IT");
		const runCmd = sandbox.execs[0]?.command ?? "";
		expect(runCmd).toContain("kiro-cli chat");
		expect(runCmd).toContain("--no-interactive");
		expect(runCmd).toContain("--trust-all-tools");
		expect(runCmd).toContain("--output-format stream-json");
		expect(runCmd).toContain('--model "claude-sonnet-4.5"');
		expect(runCmd).toContain('"$(cat /tmp/he-prompt-');
		expect(runCmd).not.toContain("--resume-id"); // first turn: no resume
		expect(sandbox.execs.at(-1)?.command.startsWith("cat /tmp/he-out-")).toBe(
			true,
		);
		expect(r.sessionId).toBe("kiro-8");
	});

	test("resume reuses the session id via --resume-id", async () => {
		const sandbox = new FakeSandbox(
			"trial.ki-2",
			[ev.started(), ev.finished()].join("\n"),
		);
		await kiroDriver.runSession(sandbox, {
			model: "m",
			prompt: "continue",
			stepIndex: 1,
			resumeSessionId: "prev-sess",
			timeoutMs: 1000,
		});
		expect(sandbox.execs[0]?.command).toContain('--resume-id "prev-sess"');
	});
});

describe("kiro registry + cost wiring", () => {
	test("bare resolves on kiro; frameworks without a section fail", () => {
		const registry = loadRegistry("config/registry.yaml");
		const harnesses = loadHarnesses();
		const bare = resolveCandidates(registry, ["bare"], "kiro", harnesses);
		expect(bare[0]?.id).toBe("bare");
		expect(bare[0]?.harnesses.kiro?.install).toEqual([]);
		expect(() =>
			resolveCandidates(registry, ["superpowers"], "kiro", harnesses),
		).toThrow(/kiro/);
	});

	test("kiro reports no billed USD → tokens-only cost source", () => {
		expect(harnessReportsCost("kiro")).toBe(false);
	});
});

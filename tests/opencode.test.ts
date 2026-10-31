import { describe, expect, test } from "bun:test";
import { getHarnessDriver, runnableHarnessIds } from "../src/driver";
import { SessionParseError } from "../src/driver/claude";
import {
	opencodeDriver,
	opencodeModelRef,
	parseOpencodeJson,
} from "../src/driver/opencode";
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
	stepStart: (sid = "oc-1") =>
		JSON.stringify({
			type: "step_start",
			timestamp: 1,
			sessionID: sid,
			part: { type: "step-start" },
		}),
	text: (text: string, sid = "oc-1") =>
		JSON.stringify({
			type: "text",
			timestamp: 2,
			sessionID: sid,
			part: { type: "text", text },
		}),
	tool: (sid = "oc-1") =>
		JSON.stringify({
			type: "tool_use",
			timestamp: 2,
			sessionID: sid,
			part: { type: "tool" },
		}),
	finish: (
		cost: number,
		input: number,
		output: number,
		read = 0,
		write = 0,
		sid = "oc-1",
	) =>
		JSON.stringify({
			type: "step_finish",
			timestamp: 3,
			sessionID: sid,
			part: {
				type: "step-finish",
				reason: "stop",
				cost,
				tokens: { input, output, cache: { read, write } },
			},
		}),
	error: (sid = "oc-1") =>
		JSON.stringify({
			type: "error",
			timestamp: 3,
			sessionID: sid,
			error: { type: "unknown", message: "boom" },
		}),
};

describe("opencode JSON event parsing", () => {
	test("parses session id, text, cost, tokens, turns", () => {
		const out = [
			ev.stepStart(),
			ev.text("Planning "),
			ev.tool(),
			ev.text("and building."),
			ev.finish(0.0123, 1200, 450, 100, 50),
		].join("\n");
		const r = parseOpencodeJson(out, 0, 0);
		expect(r.sessionId).toBe("oc-1");
		expect(r.resultText).toBe("Planning \nand building.");
		expect(r.record.costUsd).toBeCloseTo(0.0123, 6);
		expect(r.record.usage.inputTokens).toBe(1200);
		expect(r.record.usage.outputTokens).toBe(450);
		expect(r.record.usage.cacheReadTokens).toBe(100);
		expect(r.record.usage.cacheCreationTokens).toBe(50);
		expect(r.record.numTurns).toBe(1);
		expect(r.record.isError).toBe(false);
	});

	test("sums multiple steps, one turn per step_finish", () => {
		const out = [
			ev.stepStart(),
			ev.finish(0.1, 10, 5),
			ev.finish(0.2, 20, 10),
		].join("\n");
		const r = parseOpencodeJson(out, 0, 0);
		expect(r.record.numTurns).toBe(2);
		expect(r.record.costUsd).toBeCloseTo(0.3, 6);
		expect(r.record.usage.inputTokens).toBe(30);
		expect(r.record.usage.outputTokens).toBe(15);
	});

	test("an error event marks the record errored", () => {
		const out = [ev.stepStart(), ev.error()].join("\n");
		expect(parseOpencodeJson(out, 0, 0).record.isError).toBe(true);
	});

	test("non-zero exit marks the record errored", () => {
		const out = [ev.stepStart(), ev.finish(0, 1, 1)].join("\n");
		expect(parseOpencodeJson(out, 0, 1).record.isError).toBe(true);
	});

	test("no step_finish and no error → parse error (candidate-side)", () => {
		const out = [ev.stepStart(), ev.text("still going")].join("\n");
		expect(() => parseOpencodeJson(out, 0, 0)).toThrow(SessionParseError);
	});
});

describe("opencode driver wiring", () => {
	test("registered, selectable, and id matches", () => {
		expect(runnableHarnessIds()).toContain("opencode");
		expect(getHarnessDriver("opencode").id).toBe("opencode");
		expect(opencodeDriver.id).toBe("opencode");
	});

	test("maps bare model ids to models.dev provider/model form", () => {
		expect(opencodeModelRef("claude-opus-4-6")).toBe(
			"anthropic/claude-opus-4-6",
		);
		expect(opencodeModelRef("gpt-5-codex")).toBe("openai/gpt-5-codex");
		expect(opencodeModelRef("z.ai/glm-5.1")).toBe("z.ai/glm-5.1");
	});

	test("runs `opencode run --format json --auto` and passes the prompt unmutated", async () => {
		const out = [ev.stepStart("oc-8"), ev.finish(0, 1, 1, 0, 0, "oc-8")].join(
			"\n",
		);
		const sandbox = new FakeSandbox("trial.oc-1", out);
		const r = await opencodeDriver.runSession(sandbox, {
			model: "claude-opus-4-6",
			prompt: "BUILD IT",
			stepIndex: 0,
			timeoutMs: 600_000,
			env: { ANTHROPIC_API_KEY: "key" },
		});
		const prompt = sandbox.writes.find((w) =>
			w.path.startsWith("/tmp/he-prompt-"),
		);
		expect(prompt?.content).toBe("BUILD IT");
		const runCmd = sandbox.execs[0]?.command ?? "";
		expect(runCmd).toContain("opencode run");
		expect(runCmd).toContain('--model "anthropic/claude-opus-4-6"');
		expect(runCmd).toContain("--format json");
		expect(runCmd).toContain("--auto");
		expect(runCmd).toContain('"$(cat /tmp/he-prompt-');
		expect(runCmd).not.toContain("--session"); // first turn: no resume
		expect(runCmd).toContain("> /tmp/he-out-");
		expect(sandbox.execs.at(-1)?.command.startsWith("cat /tmp/he-out-")).toBe(
			true,
		);
		expect(r.sessionId).toBe("oc-8");
	});

	test("resume reuses the session id via --session", async () => {
		const out = [ev.stepStart("oc-9"), ev.finish(0, 1, 1, 0, 0, "oc-9")].join(
			"\n",
		);
		const sandbox = new FakeSandbox("trial.oc-2", out);
		await opencodeDriver.runSession(sandbox, {
			model: "m",
			prompt: "continue",
			stepIndex: 1,
			resumeSessionId: "prev-sess",
			timeoutMs: 1000,
		});
		expect(sandbox.execs[0]?.command).toContain('--session "prev-sess"');
	});
});

describe("opencode registry + cost wiring", () => {
	test("bare resolves on opencode; frameworks without a section fail", () => {
		const registry = loadRegistry("config/registry.yaml");
		const harnesses = loadHarnesses();
		const bare = resolveCandidates(registry, ["bare"], "opencode", harnesses);
		expect(bare[0]?.id).toBe("bare");
		expect(bare[0]?.harnesses.opencode?.install).toEqual([]);
		expect(() =>
			resolveCandidates(registry, ["superpowers"], "opencode", harnesses),
		).toThrow(/opencode/);
	});

	test("opencode reports per-step USD cost", () => {
		expect(harnessReportsCost("opencode")).toBe(true);
	});
});

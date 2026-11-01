import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parsePartialStreamJson } from "../src/driver/claude";
import { executeSessionScript } from "../src/driver/session";
import {
	aggregateTelemetry,
	reportsCumulativeResumeCost,
	withCorrectedCosts,
} from "../src/driver/telemetry";
import { cli, EXIT_TIMED_OUT } from "../src/providers/cli-container";
import type { Sandbox } from "../src/providers/types";

const init = (version: string) =>
	JSON.stringify({
		type: "system",
		subtype: "init",
		claude_code_version: version,
	});
const result = (session: string, cost: number, version = "2.1.316") =>
	`${init(version)}\n${JSON.stringify({
		type: "result",
		session_id: session,
		duration_ms: 1000,
		num_turns: 1,
		total_cost_usd: cost,
		usage: { input_tokens: 1, output_tokens: 1 },
		result: "done",
	})}`;
const assistant = (session: string, id: string, output: number) =>
	JSON.stringify({
		type: "assistant",
		session_id: session,
		message: {
			id,
			model: "claude-sonnet-4-6",
			usage: { input_tokens: 10, output_tokens: output },
			content: [],
		},
	});

/** A sandbox that plays back one session's output per agent exec. */
function fakeSandbox(
	outputs: string[],
	opts: { id?: string; exitCode?: number; delayMs?: number } = {},
) {
	const commands: string[] = [];
	let i = -1;
	const sandbox = {
		id: opts.id ?? "docker:test",
		workspacePath: "/w",
		writeFile: async () => {},
		exec: async (command: string) => {
			commands.push(command);
			if (command.startsWith("cat /tmp/he-out"))
				return { exitCode: 0, stdout: outputs[i] ?? "", stderr: "" };
			if (command.includes("claude -p")) {
				i++;
				if (opts.delayMs) await Bun.sleep(opts.delayMs);
				return { exitCode: opts.exitCode ?? 0, stdout: "", stderr: "" };
			}
			return { exitCode: 0, stdout: "", stderr: "" };
		},
	} as unknown as Sandbox;
	return { sandbox, commands };
}
const script = (steps: { prompt: string; newSession?: boolean }[]) => ({
	model: "m",
	steps: steps.map((s) => ({ newSession: false, ...s })),
	continuation: { maxContinuations: 3, allowlist: ["proceed"] },
	wallClockBudgetMs: 60_000,
	costBudgetUsd: 100,
});

describe("cli timeouts", () => {
	test("a client that exits 0 on SIGTERM is still reported as timed out", async () => {
		const r = await cli("sh", ["-c", "trap 'exit 0' TERM; sleep 5 & wait"], {
			timeoutMs: 200,
		});
		expect(r.exitCode).toBe(EXIT_TIMED_OUT);
	});
	test("normal exits are unchanged", async () => {
		expect((await cli("sh", ["-c", "exit 0"])).exitCode).toBe(0);
		expect((await cli("sh", ["-c", "exit 3"])).exitCode).toBe(3);
	});
});

describe("session cost", () => {
	test("resumed sessions count only their own cost", async () => {
		const { sandbox } = fakeSandbox([
			result("s", 0.3),
			result("s", 0.5),
			result("s", 0.9),
		]);
		const r = await executeSessionScript(
			sandbox,
			script([{ prompt: "a" }, { prompt: "b" }, { prompt: "c" }]),
		);
		const costs = r.records.map((x) => Number(x.costUsd.toFixed(3)));
		expect(costs).toEqual([0.3, 0.2, 0.4]);
		expect(aggregateTelemetry(r.records, 0).totalCostUsd).toBeCloseTo(0.9);
	});
	test("a new session starts from zero", async () => {
		const { sandbox } = fakeSandbox([result("s1", 0.3), result("s2", 0.2)]);
		const r = await executeSessionScript(
			sandbox,
			script([{ prompt: "a" }, { prompt: "b", newSession: true }]),
		);
		expect(aggregateTelemetry(r.records, 0).totalCostUsd).toBeCloseTo(0.5);
	});
});

describe("cost by Claude Code version", () => {
	test("older versions report per-step costs, which are summed as they are", async () => {
		const { sandbox } = fakeSandbox([
			result("s", 0.3, "2.1.170"),
			result("s", 0.5, "2.1.170"),
		]);
		const r = await executeSessionScript(
			sandbox,
			script([{ prompt: "a" }, { prompt: "b" }]),
		);
		expect(aggregateTelemetry(r.records, 0).totalCostUsd).toBeCloseTo(0.8);
	});
	test("a reported cost that falls isn't a running total", async () => {
		const { sandbox } = fakeSandbox([result("s", 0.9), result("s", 0.2)]);
		const r = await executeSessionScript(
			sandbox,
			script([{ prompt: "a" }, { prompt: "b" }]),
		);
		expect(aggregateTelemetry(r.records, 0).totalCostUsd).toBeCloseTo(1.1);
	});
	test("version gate", () => {
		expect(reportsCumulativeResumeCost("2.1.316")).toBe(true);
		expect(reportsCumulativeResumeCost("2.2.0")).toBe(true);
		expect(reportsCumulativeResumeCost("2.1.170")).toBe(false);
		expect(reportsCumulativeResumeCost("studio-live")).toBe(false);
		expect(reportsCumulativeResumeCost(undefined)).toBe(false);
	});
});

describe("archived costs corrected for display", () => {
	const session = (sessionId: string, costUsd: number) => ({
		sessionId,
		stepIndex: 0,
		durationMs: 1,
		numTurns: 1,
		costUsd,
		usage: {
			inputTokens: 0,
			outputTokens: 0,
			cacheReadTokens: 0,
			cacheCreationTokens: 0,
		},
		isError: false,
	});
	const trial = (
		version: string,
		sessions: ReturnType<typeof session>[],
		extra = {},
	) => ({
		provenance: { harness: "claude-code", harnessVersion: version },
		telemetry: {
			sessions,
			agentDurationMs: 1,
			setupDurationMs: 0,
			totalCostUsd: sessions.reduce((n, x) => n + x.costUsd, 0),
			totalTokens: sessions[0]?.usage as never,
			totalTurns: 1,
			...extra,
		},
	});
	test("GSD's archived running totals come back to its real cost, without mutating", () => {
		const t = trial(
			"2.1.316",
			[0.346, 0.602, 0.874, 1.121].map((c) => session("s", c)),
		);
		const fixed = withCorrectedCosts(t);
		expect(fixed.telemetry.totalCostUsd).toBeCloseTo(1.121);
		expect((fixed.telemetry as { costBasis?: string }).costBasis).toBe(
			"corrected-from-cumulative",
		);
		expect(t.telemetry.totalCostUsd).toBeCloseTo(2.943);
	});
	test("older versions, falling costs and new trials are left alone", () => {
		const old = trial("2.1.170", [session("s", 1), session("s", 2)]);
		expect(withCorrectedCosts(old)).toBe(old);
		const fell = trial("2.1.316", [session("s", 2), session("s", 1)]);
		expect(withCorrectedCosts(fell).telemetry.totalCostUsd).toBeCloseTo(3);
		const fresh = trial("2.1.316", [session("s", 1), session("s", 2)], {
			costBasis: "per-step",
		});
		expect(withCorrectedCosts(fresh)).toBe(fresh);
	});
});

describe("sessions cut off before their result message", () => {
	const cut = [
		assistant("s", "m1", 100),
		assistant("s", "m1", 200),
		assistant("s", "m2", 50),
	].join("\n");

	test("wall-clock expiry keeps telemetry and transcript, caps the trial, stops the agent", async () => {
		const { sandbox, commands } = fakeSandbox([cut], {
			exitCode: EXIT_TIMED_OUT,
			delayMs: 40,
		});
		const r = await executeSessionScript(sandbox, {
			...script([{ prompt: "a" }]),
			wallClockBudgetMs: 20,
		});
		expect(r.status).toBe("capped");
		expect(r.cappedBy).toBe("wall-clock");
		expect(r.transcripts).toEqual([cut]);
		const rec = r.records[0];
		expect(rec?.partial).toBe(true);
		expect(rec?.numTurns).toBe(2);
		// m1's later event replaces its earlier one instead of adding to it.
		expect(rec?.usage.outputTokens).toBe(250);
		expect(rec?.costUsd).toBeGreaterThan(0);
		expect(commands.some((c) => c.startsWith("pkill"))).toBe(true);
	});
	test("a partial step adds to the session's earlier cost, not over it", async () => {
		const { sandbox } = fakeSandbox([result("s", 1), cut]);
		const r = await executeSessionScript(
			sandbox,
			script([{ prompt: "a" }, { prompt: "b" }]),
		);
		expect(r.status).toBe("error");
		expect(r.records[0]?.costUsd).toBe(1);
		expect(r.records[1]?.costUsd).toBeLessThan(0.01);
		expect(r.records[1]?.costUsd).toBeGreaterThan(0);
	});
	test("never pkills on worktree, where it could hit the operator's sessions", async () => {
		const { sandbox, commands } = fakeSandbox([cut], {
			id: "worktree:test",
			exitCode: EXIT_TIMED_OUT,
		});
		await executeSessionScript(sandbox, script([{ prompt: "a" }]));
		expect(commands.some((c) => c.startsWith("pkill"))).toBe(false);
	});
	test("no work at all is still a failure with no record (harness never started)", async () => {
		const { sandbox } = fakeSandbox(["sh: claude: command not found"], {
			exitCode: 127,
		});
		const r = await executeSessionScript(sandbox, script([{ prompt: "a" }]));
		expect(r.status).toBe("error");
		expect(r.records).toHaveLength(0);
		expect(r.notes[0]).toContain("exit 127");
	});
	test("unverified models report tokens with no invented cost", () => {
		const out = assistant("s", "m1", 100).replace(
			"claude-sonnet-4-6",
			"other-model",
		);
		const p = parsePartialStreamJson(out, 0, 0, 1000);
		expect(p?.record.costUsd).toBe(0);
		expect(p?.record.usage.outputTokens).toBe(100);
	});
});

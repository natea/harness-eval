import { describe, expect, test } from "bun:test";
import { getHarnessDriver, runnableHarnessIds } from "../src/driver";
import { SessionParseError } from "../src/driver/claude";
import { executeSessionScript } from "../src/driver/session";
import { InfraError, isInfraError } from "../src/driver/types";
import {
	ACP_PROTOCOL_VERSION,
	parseZeroclawAcp,
	ZeroclawProtocolError,
	zerocodeDriver,
} from "../src/driver/zeroclaw";
import { harnessReportsCost, loadHarnesses } from "../src/harnesses";
import {
	costSourceForHarness,
	loadModels,
	resolveProfile,
} from "../src/models";
import { isInfraFailure } from "../src/orchestrator/scheduler";
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

const ACP = {
	handshake: (v = ACP_PROTOCOL_VERSION) =>
		JSON.stringify({ jsonrpc: "2.0", id: 0, result: { protocolVersion: v } }),
	newSession: (sid: string) =>
		JSON.stringify({ jsonrpc: "2.0", id: 1, result: { sessionId: sid } }),
	chunk: (text: string) =>
		JSON.stringify({
			jsonrpc: "2.0",
			method: "session/update",
			params: {
				update: { sessionUpdate: "agent_message_chunk", content: { text } },
			},
		}),
	toolCall: () =>
		JSON.stringify({
			jsonrpc: "2.0",
			method: "session/update",
			params: { update: { sessionUpdate: "tool_call", status: "completed" } },
		}),
	usage: (input: number, output: number, cacheRead = 0) =>
		JSON.stringify({
			jsonrpc: "2.0",
			method: "session/update",
			params: {
				update: {
					sessionUpdate: "usage",
					tokens: {
						inputTokens: input,
						outputTokens: output,
						cacheReadTokens: cacheRead,
					},
				},
			},
		}),
	promptResult: (stopReason: string, meta: Record<string, unknown> = {}) =>
		JSON.stringify({
			jsonrpc: "2.0",
			id: 2,
			result: { stopReason, _meta: meta },
		}),
	error: () =>
		JSON.stringify({
			jsonrpc: "2.0",
			id: 2,
			error: { code: -32603, message: "boom" },
		}),
};

describe("zerocode ACP parsing (task 3.1)", () => {
	test("parses framing: session id, streamed text, tokens, turns, duration", () => {
		const out = [
			ACP.handshake(),
			ACP.newSession("zc-1"),
			ACP.chunk("Planning "),
			ACP.toolCall(),
			ACP.chunk("and building."),
			ACP.usage(1200, 800, 100),
			ACP.promptResult("end_turn", { numTurns: 3, durationMs: 42000 }),
		].join("\n");
		const r = parseZeroclawAcp(out, 0, 0);
		expect(r.sessionId).toBe("zc-1");
		expect(r.resultText).toBe("Planning and building.");
		expect(r.record.usage.inputTokens).toBe(1200);
		expect(r.record.usage.outputTokens).toBe(800);
		expect(r.record.usage.cacheReadTokens).toBe(100);
		expect(r.record.numTurns).toBe(3);
		expect(r.record.durationMs).toBe(42000);
		expect(r.record.costUsd).toBe(0); // ZeroClaw reports no billed USD
		expect(r.record.isError).toBe(false);
	});

	test("turn count falls back to completed tool-calls when _meta omits it", () => {
		const out = [
			ACP.handshake(),
			ACP.newSession("zc-2"),
			ACP.toolCall(),
			ACP.toolCall(),
			ACP.promptResult("end_turn"),
		].join("\n");
		expect(parseZeroclawAcp(out, 0, 0).record.numTurns).toBe(2);
	});

	test("handshake-version mismatch is an INFRA failure (retried, not graded)", () => {
		const out = [
			ACP.handshake(2),
			ACP.newSession("zc-3"),
			ACP.promptResult("end_turn"),
		].join("\n");
		expect(() => parseZeroclawAcp(out, 0, 0)).toThrow(ZeroclawProtocolError);
		try {
			parseZeroclawAcp(out, 0, 0);
		} catch (err) {
			expect(err).toBeInstanceOf(InfraError);
			expect(isInfraError(err)).toBe(true);
			expect(isInfraFailure(err)).toBe(true);
		}
	});

	test("missing handshake (daemon never came up) is INFRA", () => {
		const out = [ACP.newSession("zc-4"), ACP.promptResult("end_turn")].join(
			"\n",
		);
		expect(() => parseZeroclawAcp(out, 0, 0)).toThrow(ZeroclawProtocolError);
	});

	test("handshake OK but no prompt result → candidate-side parse error", () => {
		const out = [ACP.handshake(), ACP.newSession("zc-5"), ACP.chunk("hi")].join(
			"\n",
		);
		expect(() => parseZeroclawAcp(out, 0, 0)).toThrow(SessionParseError);
	});

	test("an RPC error response marks the record as errored", () => {
		const out = [ACP.handshake(), ACP.newSession("zc-6"), ACP.error()].join(
			"\n",
		);
		expect(parseZeroclawAcp(out, 0, 0).record.isError).toBe(true);
	});

	test("non-zero exit marks the record as errored", () => {
		const out = [
			ACP.handshake(),
			ACP.newSession("zc-7"),
			ACP.promptResult("end_turn"),
		].join("\n");
		expect(parseZeroclawAcp(out, 0, 1).record.isError).toBe(true);
	});
});

describe("zerocode driver wiring", () => {
	test("registered, selectable, and id matches", () => {
		expect(runnableHarnessIds()).toContain("zerocode");
		expect(getHarnessDriver("zerocode").id).toBe("zerocode");
		expect(zerocodeDriver.id).toBe("zerocode");
	});

	test("runSession installs the config, pins the model, injects the credential, runs an ACP turn", async () => {
		const out = [
			ACP.handshake(),
			ACP.newSession("zc-8"),
			ACP.promptResult("end_turn"),
		].join("\n");
		const sandbox = new FakeSandbox("trial.zc-1", out);
		const r = await zerocodeDriver.runSession(sandbox, {
			model: "claude-opus-4-6",
			prompt: "BUILD IT",
			stepIndex: 0,
			timeoutMs: 600_000,
			env: { CLAUDE_CODE_OAUTH_TOKEN: "max-token" },
		});
		// Provider-agnostic: the driver ships the ACP client + config + prompt INTO
		// the sandbox (not a baked image path), so it runs on worktree/docker alike.
		const prompt = sandbox.writes.find((w) =>
			w.path.startsWith("/tmp/he-prompt-"),
		);
		expect(prompt?.content).toBe("BUILD IT"); // base prompt unmutated (fairness)
		expect(sandbox.writes.some((w) => w.path.endsWith("client-trial.zc-1.ts"))).toBe(
			true,
		);
		expect(sandbox.writes.some((w) => w.path.endsWith(".toml"))).toBe(true);
		const runCmd = sandbox.execs[0]?.command ?? "";
		// Config installed into an ISOLATED /tmp config dir (never $HOME — no clobber).
		expect(runCmd).toContain("/tmp/he-zc-trial.zc-1/config.toml");
		expect(runCmd).not.toContain("$HOME/.zeroclaw");
		// The chosen worker model is pinned into ZeroClaw (parity with Claude Code).
		expect(runCmd).toContain('models set "claude-opus-4-6"');
		// Credential via the env-override (Max token preferred, API-key fallback);
		// never auth paste-token (which authenticates the catalog but not generation).
		expect(runCmd).toContain(
			"export ZEROCLAW_providers__models__anthropic__anthropic__api_key=",
		);
		expect(runCmd).toContain("${CLAUDE_CODE_OAUTH_TOKEN:-$ANTHROPIC_API_KEY}");
		expect(runCmd).not.toContain("auth paste-token");
		// One ACP turn via the shipped stdio client, naming the configured agent.
		expect(runCmd).toContain("bun /tmp/he-zc-client-trial.zc-1.ts");
		expect(runCmd).toContain("--agent trial");
		expect(runCmd).not.toContain("zeroclaw daemon");
		expect(runCmd).not.toContain("--resume"); // first turn: no resume
		// Output read is a SEPARATE, final exec (a started service can't hold it open).
		const last = sandbox.execs.at(-1)?.command ?? "";
		expect(last.startsWith("cat /tmp/he-out-")).toBe(true);
		expect(r.sessionId).toBe("zc-8");
	});

	test("resume reuses the ACP session id", async () => {
		const out = [
			ACP.handshake(),
			ACP.newSession("zc-9"),
			ACP.promptResult("end_turn"),
		].join("\n");
		const sandbox = new FakeSandbox("trial.zc-2", out);
		await zerocodeDriver.runSession(sandbox, {
			model: "m",
			prompt: "continue",
			stepIndex: 1,
			resumeSessionId: "prev-sess",
			timeoutMs: 1000,
		});
		expect(sandbox.execs[0]?.command).toContain('--resume "prev-sess"');
	});

	test("handshake mismatch in a session step propagates as infra (not graded)", async () => {
		const out = [
			ACP.handshake(99),
			ACP.newSession("zc-x"),
			ACP.promptResult("end_turn"),
		].join("\n");
		const sandbox = new FakeSandbox("trial.zc-3", out);
		const run = executeSessionScript(sandbox, {
			driver: zerocodeDriver,
			model: "m",
			steps: [{ prompt: "go", newSession: false }],
			continuation: { allowlist: ["proceed"], maxContinuations: 1 },
			wallClockBudgetMs: 60_000,
			costBudgetUsd: 10,
		});
		await expect(run).rejects.toBeInstanceOf(ZeroclawProtocolError);
	});
});

describe("zerocode registry + cost wiring (specs)", () => {
	test("bare candidate resolves on zerocode; frameworks without a zerocode section fail", () => {
		const registry = loadRegistry("config/registry.yaml");
		const harnesses = loadHarnesses();
		// Bare baseline is valid on zerocode (candidate-registry D5).
		const bare = resolveCandidates(registry, ["bare"], "zerocode", harnesses);
		expect(bare[0]?.id).toBe("bare");
		expect(bare[0]?.harnesses.zerocode?.install).toEqual([]);
		// A Claude Code framework has no zerocode section → load-time failure.
		expect(() =>
			resolveCandidates(registry, ["superpowers"], "zerocode", harnesses),
		).toThrow(/zerocode/);
	});

	test("zerocode reports no billed USD → cost is profile-priced/tokens-only", () => {
		expect(harnessReportsCost("zerocode")).toBe(false);
		const models = loadModels();
		// Anthropic route with pricing → profile-priced (not harness-reported $0).
		const apiProfile = resolveProfile("claude-opus-4-6-api", models);
		expect(costSourceForHarness(apiProfile, false)).toBe("profile-priced");
		// Unpriced profile → tokens-only.
		const glm = resolveProfile("glm-5.1", models);
		expect(costSourceForHarness(glm, false)).toBe("tokens-only");
		// Claude Code (reportsCost true) keeps harness-reported for native Anthropic.
		expect(harnessReportsCost("claude-code")).toBe(true);
	});
});

import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { redactSecrets } from "../src/driver/archive";
import { type ClaudeResult, parseStreamJson } from "../src/driver/claude";
import type { SessionScriptResult } from "../src/driver/session";
import { executeSessionScript, looksLikeGate } from "../src/driver/session";
import { aggregateTelemetry } from "../src/driver/telemetry";
import { scoreAdherence } from "../src/grading/evaluator";
import { median } from "../src/grading/judge";
import {
	composite,
	isInconclusive,
	normalizeAcrossCandidates,
	stats,
} from "../src/grading/scoring";
import { loadTestPlan } from "../src/grading/testplan";
import {
	buildMatrix,
	isInfraFailure,
	RunLedger,
	runTrial,
} from "../src/orchestrator/scheduler";
import type { Sandbox, SandboxProvider } from "../src/providers/types";
import {
	loadRegistry,
	renderSessionScript,
	resolveCandidates,
} from "../src/registry";
import {
	RunConfig,
	type SessionRecord,
	type TestPlan,
	type Weights,
} from "../src/types";

const tmp = mkdtempSync(join(tmpdir(), "he-unit-"));

describe("registry validation (8.1)", () => {
	test("rejects missing pinned version", () => {
		const p = join(tmp, "bad-registry.yaml");
		writeFileSync(
			p,
			`basePrompt: x\ncandidates:\n  - id: foo\n    name: Foo\n    repo: https://example.com/foo\n    harnesses:\n      claude-code:\n        install: ["true"]\n        session:\n          - prompt: "{{BASE_PROMPT}}"\n`,
		);
		expect(() => loadRegistry(p)).toThrow(/pinnedVersion|invalid/i);
	});

	test("rejects pinnedVersion latest", () => {
		const p = join(tmp, "latest-registry.yaml");
		writeFileSync(
			p,
			`basePrompt: x\ncandidates:\n  - id: foo\n    name: Foo\n    repo: https://example.com/foo\n    pinnedVersion: latest\n    harnesses:\n      claude-code:\n        install: ["true"]\n        session:\n          - prompt: "p"\n`,
		);
		expect(() => loadRegistry(p)).toThrow(/latest/);
	});

	test("rejects duplicate candidate ids", () => {
		const p = join(tmp, "duplicate-registry.yaml");
		writeFileSync(
			p,
			`basePrompt: x\ncandidates:\n  - id: foo\n    name: Foo\n    repo: https://example.com/foo\n    pinnedVersion: 1.0.0\n    harnesses:\n      claude-code:\n        install: ["true"]\n        session:\n          - prompt: "p"\n  - id: foo\n    name: Foo Again\n    repo: https://example.com/foo2\n    pinnedVersion: 2.0.0\n    harnesses:\n      claude-code:\n        install: ["true"]\n        session:\n          - prompt: "p"\n`,
		);
		expect(() => loadRegistry(p)).toThrow(/duplicate candidate id: foo/);
	});

	test("rejects unimplemented harness keys instead of ignoring them", () => {
		const p = join(tmp, "unknown-harness-registry.yaml");
		writeFileSync(
			p,
			`basePrompt: x\ncandidates:\n  - id: foo\n    name: Foo\n    repo: https://example.com/foo\n    pinnedVersion: 1.0.0\n    harnesses:\n      claude-code:\n        install: ["true"]\n        session:\n          - prompt: "p"\n      opencode:\n        install: ["true"]\n        session:\n          - prompt: "p"\n`,
		);
		expect(() => loadRegistry(p)).toThrow(
			/invalid harness section .*opencode|Invalid key/,
		);
	});

	test("renders the shared base prompt into harness session scripts", () => {
		const registry = loadRegistry("config/registry.yaml");
		const firstCandidate = registry.candidates[0];
		if (!firstCandidate) throw new Error("missing registry fixture candidate");
		const candidate = {
			...firstCandidate,
			harnesses: {
				"claude-code": {
					install: ["true"],
					session: [
						{
							prompt: "/wrap {{BASE_PROMPT}} then {{BASE_PROMPT}}",
							newSession: true,
						},
					],
					continuation: {
						allowlist: ["proceed", "continue with the plan"],
						maxContinuations: 10,
					},
				},
			},
		};
		const rendered = renderSessionScript(
			{ basePrompt: "SHARED TASK" },
			candidate,
			"claude-code",
		);
		expect(rendered).toEqual([
			{
				prompt: "/wrap SHARED TASK then SHARED TASK",
				newSession: true,
			},
		]);
	});

	test("shipped registry loads; unknown harness fails at load time", () => {
		const registry = loadRegistry("config/registry.yaml");
		expect(registry.candidates).toHaveLength(4);
		expect(() => resolveCandidates(registry, ["gsd"], "opencode")).toThrow(
			/unknown harness 'opencode'/,
		);
	});
});

describe("stream-json parsing and telemetry (8.1)", () => {
	const resultLine = JSON.stringify({
		type: "result",
		subtype: "success",
		is_error: false,
		duration_ms: 65000,
		num_turns: 12,
		total_cost_usd: 1.25,
		session_id: "s-1",
		result: "done",
		usage: {
			input_tokens: 100,
			output_tokens: 50,
			cache_read_input_tokens: 7,
			cache_creation_input_tokens: 3,
		},
	});

	test("parses final result message", () => {
		const r = parseStreamJson(
			`{"type":"system","session_id":"s-1"}\n${resultLine}\n`,
			0,
			0,
		);
		expect(r.record.durationMs).toBe(65000);
		expect(r.record.costUsd).toBe(1.25);
		expect(r.record.usage.cacheReadTokens).toBe(7);
		expect(r.sessionId).toBe("s-1");
	});

	test("throws without a result message", () => {
		expect(() => parseStreamJson('{"type":"system"}\n', 0, 0)).toThrow(
			/no result/,
		);
	});

	test("aggregates sessions; setup time excluded from agent time", () => {
		const mk = (ms: number, usd: number): SessionRecord => ({
			sessionId: "s",
			stepIndex: 0,
			durationMs: ms,
			numTurns: 2,
			costUsd: usd,
			usage: {
				inputTokens: 10,
				outputTokens: 5,
				cacheReadTokens: 0,
				cacheCreationTokens: 0,
			},
			isError: false,
		});
		const t = aggregateTelemetry([mk(60000, 1), mk(30000, 0.5)], 240000);
		expect(t.agentDurationMs).toBe(90000);
		expect(t.setupDurationMs).toBe(240000);
		expect(t.totalCostUsd).toBe(1.5);
		expect(t.totalTokens.inputTokens).toBe(20);
	});
});

describe("harness driver dispatch", () => {
	test("executes session scripts with env, resume semantics, and generic continuations", async () => {
		const calls: Array<{
			prompt: string;
			stepIndex: number;
			resumeSessionId?: string;
			env?: Record<string, string>;
		}> = [];
		const runSession = async (
			_sandbox: Sandbox,
			opts: {
				prompt: string;
				stepIndex: number;
				resumeSessionId?: string;
				env?: Record<string, string>;
			},
		): Promise<ClaudeResult> => {
			calls.push(opts);
			const resultText =
				opts.prompt === "first" ? "Plan ready. Shall I proceed?" : "done";
			const sessionId = opts.stepIndex < 2 ? "s-a" : "s-b";
			return {
				record: {
					sessionId,
					stepIndex: opts.stepIndex,
					durationMs: 10,
					numTurns: 1,
					costUsd: 0,
					usage: {
						inputTokens: 1,
						outputTokens: 1,
						cacheReadTokens: 0,
						cacheCreationTokens: 0,
					},
					isError: false,
				},
				resultText,
				sessionId,
				transcript: "{}",
			};
		};

		const result = await executeSessionScript({} as Sandbox, {
			model: "m",
			steps: [
				{ prompt: "first", newSession: false },
				{ prompt: "second", newSession: true },
			],
			continuation: { allowlist: ["approve"], maxContinuations: 2 },
			wallClockBudgetMs: 60_000,
			costBudgetUsd: 1,
			env: { ANTHROPIC_BASE_URL: "https://models.test" },
			runSession: runSession as never,
		});

		expect(result.status).toBe("completed");
		expect(calls.map((c) => c.prompt)).toEqual(["first", "approve", "second"]);
		expect(calls.map((c) => c.resumeSessionId)).toEqual([
			undefined,
			"s-a",
			undefined,
		]);
		expect(calls.every((c) => c.env?.ANTHROPIC_BASE_URL)).toBe(true);
		expect(result.notes).toContain("step 0: continuation 1 ('approve')");
	});
});

class MemorySandbox implements Sandbox {
	id = "mem-trial";
	workspacePath = "/workspace";
	writes = new Map<string, string>();
	execs: Array<{ command: string; env?: Record<string, string> }> = [];
	destroyed = false;

	async exec(command: string, opts?: { env?: Record<string, string> }) {
		this.execs.push({ command, env: opts?.env });
		return { exitCode: 0, stdout: "", stderr: "" };
	}
	async copyOut() {}
	async writeFile(sandboxPath: string, content: string) {
		this.writes.set(sandboxPath, content);
	}
	async destroy() {
		this.destroyed = true;
	}
}

class MemoryProvider implements SandboxProvider {
	id = "worktree" as const;
	snapshotId = "memory-snapshot";
	sandboxes: MemorySandbox[] = [];
	async provision() {
		const sandbox = new MemorySandbox();
		this.sandboxes.push(sandbox);
		return sandbox;
	}
}

describe("scheduler integration with pluggable providers and harness setup", () => {
	test("installs registry setup, injects worker model env, archives, and records provenance", async () => {
		const registry = loadRegistry("config/registry.yaml");
		const firstCandidate = registry.candidates[0];
		if (!firstCandidate) throw new Error("missing registry fixture candidate");
		const candidate = {
			...firstCandidate,
			harnesses: {
				"claude-code": {
					install: ["setup-one", "setup-two"],
					session: [{ prompt: "do {{BASE_PROMPT}}", newSession: false }],
					continuation: { allowlist: ["go"], maxContinuations: 3 },
				},
			},
		};
		const provider = new MemoryProvider();
		const config = RunConfig.parse({
			candidates: [candidate.id],
			trialsPerCandidate: 1,
			provider: "worktree",
			model: "worker-profile",
		});
		const seen: {
			model?: string;
			steps?: unknown;
			continuation?: unknown;
			env?: Record<string, string>;
		} = {};
		const executeScript = async (
			sandbox: Sandbox,
			opts: {
				model: string;
				steps: unknown;
				continuation: unknown;
				env?: Record<string, string>;
			},
		): Promise<SessionScriptResult> => {
			seen.model = opts.model;
			seen.steps = opts.steps;
			seen.continuation = opts.continuation;
			seen.env = opts.env;
			await sandbox.writeFile("artifact.txt", "built");
			return {
				records: [
					{
						sessionId: "s",
						stepIndex: 0,
						durationMs: 1,
						numTurns: 1,
						costUsd: 0,
						usage: {
							inputTokens: 1,
							outputTokens: 1,
							cacheReadTokens: 0,
							cacheCreationTokens: 0,
						},
						isError: false,
					},
				],
				transcripts: ["{}"],
				status: "completed",
				cappedBy: null,
				notes: [],
			};
		};
		const archived: string[] = [];

		const trial = await runTrial(
			{ trialId: "superpowers-t1", candidate, trialIndex: 0 },
			config,
			{
				provider,
				registry: {
					...registry,
					basePrompt: "same task",
					candidates: [candidate],
				},
				runDir: join(tmp, "scheduler-integration"),
				prdContent: "# PRD",
				prdSha256: "prd",
				testPlanSha256: "plan",
				designContent: "# Design",
				harnessVersion: "harness-v1",
				workerEnv: { ANTHROPIC_AUTH_TOKEN: "secret-token" },
				workerModelFlag: "opus",
				executeScript: executeScript as never,
				archive: async (_sandbox, trialDir) => {
					archived.push(trialDir);
					return {
						workspaceDir: `${trialDir}/workspace`,
						transcriptPaths: [],
						redactions: 0,
					};
				},
			},
			new RunLedger(10),
		);

		const sandbox = provider.sandboxes[0];
		if (!sandbox) throw new Error("provider was not provisioned");
		expect(sandbox.execs.map((e) => e.command)).toEqual([
			"setup-one",
			"setup-two",
		]);
		expect(sandbox.writes.get("/workspace/SPEC.md")).toBe("# PRD");
		expect(sandbox.writes.get("/workspace/DESIGN.md")).toBe("# Design");
		expect(seen.model).toBe("opus");
		expect(seen.env).toEqual({ ANTHROPIC_AUTH_TOKEN: "secret-token" });
		expect(seen.steps).toEqual([{ prompt: "do same task", newSession: false }]);
		expect(seen.continuation).toEqual({
			allowlist: ["go"],
			maxContinuations: 3,
		});
		expect(trial.provenance.provider).toBe("worktree");
		expect(trial.provenance.snapshotId).toBe("memory-snapshot");
		expect(trial.provenance.harness).toBe("claude-code");
		expect(trial.provenance.harnessVersion).toBe("harness-v1");
		expect(trial.provenance.sessionScript[0]?.prompt).toBe("do same task");
		expect(archived[0]).toMatch(
			/scheduler-integration\/trials\/superpowers-t1$/,
		);
		expect(sandbox.destroyed).toBe(true);
		expect(
			existsSync(
				join(
					tmp,
					"scheduler-integration",
					"trials",
					"superpowers-t1",
					"provenance.json",
				),
			),
		).toBe(true);
	});
});

describe("normalization and composite (8.1)", () => {
	test("min-max normalization, lower is better (design D5 example)", () => {
		const means = new Map([
			["a", 30],
			["b", 45],
			["c", 60],
			["d", 90],
		]);
		const scores = normalizeAcrossCandidates(means, true);
		expect(scores.get("a")).toBe(100);
		expect(scores.get("b")).toBe(75);
		expect(scores.get("c")).toBe(50);
		expect(scores.get("d")).toBe(0);
	});

	test("all-equal degenerates to 100", () => {
		const scores = normalizeAcrossCandidates(
			new Map([
				["a", 5],
				["b", 5],
			]),
			true,
		);
		expect(scores.get("a")).toBe(100);
		expect(scores.get("b")).toBe(100);
	});

	test("weighted composite with default weights", () => {
		const w: Weights = {
			prdAdherence: 0.4,
			codeQuality: 0.25,
			speed: 0.175,
			tokenSpend: 0.175,
		};
		expect(
			composite(
				{ prdAdherence: 100, codeQuality: 100, speed: 100, tokenSpend: 100 },
				w,
			),
		).toBe(100);
		expect(
			composite(
				{ prdAdherence: 50, codeQuality: 0, speed: 0, tokenSpend: 0 },
				w,
			),
		).toBe(20);
	});

	test("stats", () => {
		const s = stats([2, 4, 6]);
		expect(s.mean).toBe(4);
		expect(s.min).toBe(2);
		expect(s.max).toBe(6);
		expect(s.stddev).toBeCloseTo(1.633, 2);
	});
});

describe("adherence scoring (8.1, ViBench semantics)", () => {
	const plan: TestPlan = {
		version: "t",
		prdSha256: "x",
		steps: [
			{
				id: "A",
				covers: ["1"],
				description: "a",
				check: "c",
				weight: 2,
				bonus: false,
				fatal: true,
			},
			{
				id: "B",
				covers: ["1"],
				description: "b",
				check: "c",
				weight: 1,
				bonus: false,
				fatal: false,
			},
			{
				id: "C",
				covers: ["1"],
				description: "c",
				check: "c",
				weight: 1,
				bonus: true,
				fatal: false,
			},
		],
	};

	test("graded score is weighted partial credit over non-bonus steps", () => {
		const r = scoreAdherence(plan, [
			{ stepId: "A", outcome: "pass", credit: 1, evidence: "e" },
			{ stepId: "B", outcome: "partial", credit: 0.5, evidence: "e" },
			{ stepId: "C", outcome: "pass", credit: 1, evidence: "e" }, // bonus ignored
		]);
		expect(r.gradedScore).toBeCloseTo(((2 + 0.5) / 3) * 100, 1);
		expect(r.passAt1).toBe(false);
		expect(r.completeFailure).toBe(false);
	});

	test("pass@1 requires every non-bonus step to pass; complete failure when none pass", () => {
		const pass = scoreAdherence(plan, [
			{ stepId: "A", outcome: "pass", credit: 1, evidence: "e" },
			{ stepId: "B", outcome: "pass", credit: 1, evidence: "e" },
		]);
		expect(pass.passAt1).toBe(true);
		const cf = scoreAdherence(plan, [
			{ stepId: "A", outcome: "fail", credit: 0, evidence: "e" },
			{ stepId: "B", outcome: "fail", credit: 0, evidence: "e" },
		]);
		expect(cf.completeFailure).toBe(true);
		expect(cf.gradedScore).toBe(0);
	});
});

describe("redaction (8.1)", () => {
	test("redacts env secret values and credential-shaped strings", () => {
		const secrets = ["super-secret-value-123"];
		const input = `key=super-secret-value-123 and lin_api_${"A".repeat(24)} and dtn_${"a1b2c3d4".repeat(5)}`;
		const { text, redactions } = redactSecrets(input, secrets);
		expect(text).not.toContain("super-secret-value-123");
		expect(text).not.toContain("lin_api_");
		expect(text).not.toContain("dtn_");
		expect(redactions).toBeGreaterThanOrEqual(3);
	});

	test("leaves clean text untouched", () => {
		const { text, redactions } = redactSecrets("nothing to see", [
			"zzz-secret",
		]);
		expect(text).toBe("nothing to see");
		expect(redactions).toBe(0);
	});
});

describe("scheduler helpers (8.1)", () => {
	test("matrix interleaves candidates and sizes correctly", () => {
		const registry = loadRegistry("config/registry.yaml");
		const plans = buildMatrix(registry.candidates, 3);
		expect(plans).toHaveLength(12);
		const firstFour = plans.slice(0, 4).map((p) => p.candidate.id);
		expect(new Set(firstFour).size).toBe(4); // round-robin, not 3x same candidate
	});

	test("infra vs candidate failure classification", () => {
		expect(isInfraFailure(new Error("sandbox provisioning timed out"))).toBe(
			true,
		);
		expect(isInfraFailure(new Error("ECONNRESET"))).toBe(true);
		expect(
			isInfraFailure(new Error("install failed (provisioning): npm exited 1")),
		).toBe(true);
		expect(isInfraFailure(new Error("tests failed: 3 assertions"))).toBe(false);
	});
});

describe("misc (8.1)", () => {
	test("gate detection", () => {
		expect(
			looksLikeGate("Plan ready. Shall I proceed with implementation?"),
		).toBe(true);
		expect(looksLikeGate("Done. All 18 conformance items implemented.")).toBe(
			false,
		);
	});

	test("median", () => {
		expect(median([9, 6, 7])).toBe(7);
		expect(median([4, 8])).toBe(6);
	});

	test("test plan loads with coverage and PRD hash binding", () => {
		expect(() =>
			loadTestPlan("targets/symphony-daemon/testplan.yaml", "wrong-hash"),
		).toThrow(/PRD/);
		const { plan } = loadTestPlan("targets/symphony-daemon/testplan.yaml");
		expect(plan.steps.filter((s) => s.fatal).map((s) => s.id)).toEqual([
			"S-1",
			"S-2",
		]);
	});

	test("inconclusive flag on overlapping composite ranges", () => {
		const mkScore = (candidate: string, comp: number, sd: number) => ({
			candidate,
			harness: "claude-code" as const,
			model: "m",
			dimensions: { prdAdherence: 0, codeQuality: 0, speed: 0, tokenSpend: 0 },
			stats: {
				prdAdherence: stats([0]),
				codeQuality: stats([0]),
				speed: stats([0]),
				tokenSpend: stats([0]),
			},
			composite: comp,
			compositeStats: {
				mean: comp,
				min: comp - sd,
				max: comp + sd,
				stddev: sd,
			},
			trialsCounted: 3,
			rightCensored: false,
		});
		expect(isInconclusive([mkScore("a", 78, 9), mkScore("b", 74, 8)])).toBe(
			true,
		);
		expect(isInconclusive([mkScore("a", 90, 2), mkScore("b", 60, 3)])).toBe(
			false,
		);
	});
});

test("provider quota errors classify as infra failures", () => {
	expect(
		isInfraFailure(
			new Error(
				"DaytonaValidationError: Total memory limit exceeded. Maximum allowed: 10GiB.",
			),
		),
	).toBe(true);
});

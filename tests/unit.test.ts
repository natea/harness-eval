import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { redactSecrets } from "../src/driver/archive";
import { parseStreamJson } from "../src/driver/claude";
import { looksLikeGate } from "../src/driver/session";
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
import { buildMatrix, isInfraFailure } from "../src/orchestrator/scheduler";
import { loadRegistry, resolveCandidates } from "../src/registry";
import type { SessionRecord, TestPlan, Weights } from "../src/types";

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

	test("shipped registry loads; unknown harness fails at load time", () => {
		const registry = loadRegistry("config/registry.yaml");
		expect(registry.candidates).toHaveLength(4);
		// A harness with no candidate setup is rejected (cast: `opencode` is no
		// longer a HarnessId until its driver lands).
		expect(() =>
			resolveCandidates(registry, ["gsd"], "opencode" as never),
		).toThrow(/opencode/);
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

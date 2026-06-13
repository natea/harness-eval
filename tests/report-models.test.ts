import { describe, expect, test } from "bun:test";
import { renderScorecard } from "../src/report/markdown";
import { buildResults } from "../src/report/results";
import { RunConfig, type TrialResult } from "../src/types";

// Minimal completed trial with grades so a score is produced.
function trial(candidate: string): TrialResult {
	return {
		provenance: {
			runId: "run-x",
			trialId: `${candidate}-t1`,
			candidate,
			candidateVersion: "1.0.0",
			harness: "claude-code",
			harnessVersion: "2.1.170",
			model: "x",
			provider: "worktree",
			snapshotId: null,
			prdSha256: "sha",
			testPlanSha256: "plan",
			sessionScript: [],
			startedAt: "2026-06-13T00:00:00.000Z",
			endedAt: "2026-06-13T00:10:00.000Z",
			status: "completed",
			cappedBy: null,
			notes: [],
		},
		telemetry: {
			sessions: [],
			agentDurationMs: 600000,
			setupDurationMs: 1000,
			totalCostUsd: 0.3,
			totalTokens: {
				inputTokens: 1000,
				outputTokens: 500,
				cacheReadTokens: 0,
				cacheCreationTokens: 0,
			},
			totalTurns: 4,
		},
		grades: {
			trialId: `${candidate}-t1`,
			adherence: {
				gradedScore: 70,
				passAt1: true,
				completeFailure: false,
				stepResults: [],
			},
			quality: { judgeModel: "j", criteria: [], score: 60 },
			integration: null,
		},
	} as unknown as TrialResult;
}

describe("reporting with model registry (tasks 3.1/3.2)", () => {
	const config = RunConfig.parse({
		candidates: ["gsd"],
		trialsPerCandidate: 1,
		provider: "worktree",
	});

	test("results key scores by the resolved worker model, not config.model", () => {
		const results = buildResults({
			runId: "run-x",
			config, // config.model is the default claude-opus-4-6
			prdSha256: "sha",
			testPlanSha256: "plan",
			startedAt: "2026-06-13T00:00:00.000Z",
			endedAt: "2026-06-13T00:10:00.000Z",
			trials: [trial("gsd")],
			workerModel: {
				name: "glm-4.7",
				provider: "z.ai",
				modelId: "glm-4.7",
				endpointHost: "api.z.ai",
			},
			judgeModel: {
				name: "claude-sonnet-4-6",
				provider: "anthropic",
				modelId: "claude-sonnet-4-6",
				endpointHost: null,
			},
			crossVendorJudge: true,
			costSource: "tokens-only",
		});
		expect(results.scores[0]?.model).toBe("glm-4.7");
		expect(results.workerModel?.provider).toBe("z.ai");
		expect(results.crossVendorJudge).toBe(true);
		expect(results.costSource).toBe("tokens-only");
	});

	test("scorecard renders cross-vendor and cost-basis caveats", () => {
		const results = buildResults({
			runId: "run-x",
			config,
			prdSha256: "sha",
			testPlanSha256: "plan",
			startedAt: "2026-06-13T00:00:00.000Z",
			endedAt: "2026-06-13T00:10:00.000Z",
			trials: [trial("gsd")],
			workerModel: {
				name: "glm-4.7",
				provider: "z.ai",
				modelId: "glm-4.7",
				endpointHost: "api.z.ai",
			},
			judgeModel: {
				name: "claude-sonnet-4-6",
				provider: "anthropic",
				modelId: "claude-sonnet-4-6",
				endpointHost: null,
			},
			crossVendorJudge: true,
			costSource: "tokens-only",
		});
		const md = renderScorecard(results);
		expect(md).toContain("worker model **glm-4.7 (z.ai)**");
		expect(md).toContain("Cross-vendor judge");
		expect(md).toContain("tokens-only");
	});

	test("native run has no caveats and keeps backward-compatible defaults", () => {
		const results = buildResults({
			runId: "run-x",
			config,
			prdSha256: "sha",
			testPlanSha256: "plan",
			startedAt: "2026-06-13T00:00:00.000Z",
			endedAt: "2026-06-13T00:10:00.000Z",
			trials: [trial("gsd")],
		});
		// Omitted fields default: no cross-vendor caveat, harness-reported cost.
		expect(results.crossVendorJudge).toBe(false);
		expect(results.costSource).toBe("harness-reported");
		const md = renderScorecard(results);
		expect(md).not.toContain("Cross-vendor judge");
	});
});

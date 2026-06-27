import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JudgeOptions } from "../src/grading/judge";
import { gradeTrials } from "../src/orchestrator/grade";
import { ModelProfile } from "../src/models";
import { loadRegistry } from "../src/registry";
import { loadTarget } from "../src/targets";
import type { TrialResult } from "../src/types";

function makeTrial(trialId: string): TrialResult {
	return {
		provenance: {
			runId: "run-partial",
			trialId,
			candidate: "bare",
			candidateVersion: "none",
			harness: "codex",
			harnessVersion: "0.142.0",
			status: "completed",
			startedAt: "2026-06-25T00:00:00.000Z",
			endedAt: "2026-06-25T00:01:00.000Z",
			model: "ollama-local",
			workerModel: {
				name: "ollama-qwen3.6-35b",
				provider: "ollama",
				modelId: "qwen3.6:35b",
				transport: "codex",
				endpointHost: null,
			},
			provider: "worktree",
			snapshotId: null,
			prdSha256: "0".repeat(64),
			testPlanSha256: "1".repeat(64),
			sessionScript: [{ prompt: "build it", newSession: false }],
			cappedBy: null,
			notes: [],
		},
		telemetry: {
			totalTurns: 1,
			totalCostUsd: 0,
			totalTokens: {
				inputTokens: 1,
				outputTokens: 1,
				cacheReadTokens: 0,
				cacheCreationTokens: 0,
			},
			agentDurationMs: 1000,
			setupDurationMs: 0,
			sessions: [],
		},
		grades: null,
	};
}

const localJudgeProfile = ModelProfile.parse({
	name: "ollama-gemma4-judge",
	provider: "ollama",
	modelId: "gemma4:latest",
	transport: "openai-compat",
	baseUrl: "http://localhost:11434/v1",
	authKind: "none",
});

test("local quality judge still records grades when adherence evaluator fails", async () => {
	const root = mkdtempSync(join(tmpdir(), "he-grade-partial-"));
	try {
		const runDir = join(root, "run");
		const trialId = "bare-t1";
		const workspace = join(runDir, "trials", trialId, "workspace");
		mkdirSync(workspace, { recursive: true });
		writeFileSync(join(workspace, "server.js"), "console.log('ok')\n");
		const trial = makeTrial(trialId);

		await gradeTrials([trial], {
			target: loadTarget("cli-tool"),
			design: null,
			registry: loadRegistry("config/registry.yaml"),
			judgeModel: "ollama-gemma4-judge",
			judgeProfile: localJudgeProfile,
			runDir,
			driver: "cc",
			deps: {
				startFixtures: () => [],
				stopFixtures: () => undefined,
				runEvaluatorCC: async () => {
					throw new Error("missing CLAUDE_CODE_OAUTH_TOKEN");
				},
				judgeQuality: async () => ({
					judgeModel: "gemma4:latest",
					criteria: [
						{
							criterion: "tests",
							samples: [7],
							sampleDetails: [
								{
									score: 7,
									justification: "local judge scored archived workspace",
									usedFallback: false,
								},
							],
							score: 7,
							justification: "local judge scored archived workspace",
						},
					],
					score: 70,
				}),
			},
		} as never);

		expect(trial.grades?.adherence).toBeNull();
		expect(trial.grades?.quality?.score).toBe(70);
		expect(trial.grades?.grading).toMatchObject({
			evaluatorDriver: "cc",
			qualityDriver: "sdk",
			judgeTransport: "openai-compat",
		});
		expect(trial.provenance.notes).toContain(
			"adherence grading incomplete: Error: missing CLAUDE_CODE_OAUTH_TOKEN",
		);
		const written = JSON.parse(
			readFileSync(join(runDir, "trials", trialId, "grades.json"), "utf8"),
		);
		expect(written.adherence).toBeNull();
		expect(written.quality.score).toBe(70);
		expect(written.grading.qualityDriver).toBe("sdk");
		expect(written.grading.judgeTransport).toBe("openai-compat");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("quality grading checkpoints criteria before a local judge failure", async () => {
	const root = mkdtempSync(join(tmpdir(), "he-grade-checkpoint-"));
	try {
		const runDir = join(root, "run");
		const trialId = "bare-t1";
		const workspace = join(runDir, "trials", trialId, "workspace");
		mkdirSync(workspace, { recursive: true });
		writeFileSync(join(workspace, "server.js"), "console.log('ok')\n");
		const trial = makeTrial(trialId);

		await gradeTrials([trial], {
			target: loadTarget("cli-tool"),
			design: null,
			registry: loadRegistry("config/registry.yaml"),
			judgeModel: "ollama-gemma4-judge",
			judgeProfile: localJudgeProfile,
			runDir,
			driver: "cc",
			deps: {
				startFixtures: () => [],
				stopFixtures: () => undefined,
				runEvaluatorCC: async () => {
					throw new Error("missing CLAUDE_CODE_OAUTH_TOKEN");
				},
				judgeQuality: async (opts: JudgeOptions) => {
					opts.onCriterion?.({
						criterion: "tests",
						samples: [6],
						sampleDetails: [
							{
								score: 6,
								justification: "checkpoint before failure",
								usedFallback: false,
							},
						],
						score: 6,
						justification: "checkpoint before failure",
					});
					throw new Error("local judge timed out");
				},
			},
		} as never);

		expect(trial.grades).toBeNull();
		expect(trial.provenance.notes).toContain(
			"quality grading incomplete: Error: local judge timed out",
		);
		const checkpoint = JSON.parse(
			readFileSync(
				join(runDir, "trials", trialId, "judge-checkpoint.json"),
				"utf8",
			),
		);
		expect(checkpoint).toHaveLength(1);
		expect(checkpoint[0]).toMatchObject({
			criterion: "tests",
			score: 6,
		});
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

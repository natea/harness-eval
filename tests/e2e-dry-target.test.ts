import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SessionScriptResult } from "../src/driver/session";
import { scoreAdherence } from "../src/grading/evaluator";
import { buildMatrix, runMatrix } from "../src/orchestrator/scheduler";
import { WorktreeProvider } from "../src/providers/worktree";
import { loadRegistry } from "../src/registry";
import { writeScorecard } from "../src/report/markdown";
import { buildResults, writeResults } from "../src/report/results";
import { loadTarget, renderTargetPrompt } from "../src/targets";
import { RunConfig, type SessionRecord, type StepResult } from "../src/types";

const base = mkdtempSync(join(tmpdir(), "he-e2e-target-"));
const runDir = join(base, "run-dry-webapp");
mkdirSync(join(runDir, "trials"), { recursive: true });
afterAll(() => rmSync(base, { recursive: true, force: true }));

/**
 * 4.2 end-to-end dry run on a NON-Symphony target: the orchestration + report
 * chain must carry an adapted target's PRD/plan and hashes end to end, with no
 * Claude Code and no API spend (fake executor, synthetic grading).
 */
describe("e2e dry run on a non-Symphony target (task 4.2)", () => {
	test("web-app target flows through orchestration, grading, and scorecard", async () => {
		const registry = loadRegistry("config/registry.yaml");
		const target = loadTarget("web-app");

		// Target slots render into the shared base prompt (fairness: identical
		// rendered prompt for every candidate in a run).
		const rendered = renderTargetPrompt(registry.basePrompt, target);
		expect(rendered).not.toContain("{{");
		registry.basePrompt = rendered;

		const config = RunConfig.parse({
			candidates: ["superpowers"],
			trialsPerCandidate: 1,
			provider: "worktree",
			concurrency: 1,
		});
		const candidate = registry.candidates.find((c) => c.id === "superpowers");
		if (!candidate) throw new Error("missing candidate");
		const dryCandidate = {
			...candidate,
			harnesses: {
				"claude-code": {
					...candidate.harnesses["claude-code"]!,
					install: ["true"],
				},
			},
		};
		const dryRegistry = { ...registry, candidates: [dryCandidate] };

		const fakeExecutor = async (sandbox: {
			writeFile: (p: string, c: string) => Promise<void>;
		}): Promise<SessionScriptResult> => {
			await sandbox.writeFile("setup.sh", "#!/bin/sh\nexit 0\n");
			await sandbox.writeFile("start.sh", "#!/bin/sh\nsleep 60\n");
			const record: SessionRecord = {
				sessionId: "dry-webapp-1",
				stepIndex: 0,
				durationMs: 90000,
				numTurns: 5,
				costUsd: 0.21,
				usage: {
					inputTokens: 4000,
					outputTokens: 1200,
					cacheReadTokens: 0,
					cacheCreationTokens: 0,
				},
				isError: false,
			};
			return {
				records: [record],
				transcripts: ['{"type":"result"}'],
				status: "completed",
				cappedBy: null,
				notes: [],
			};
		};

		const provider = new WorktreeProvider(join(base, "sandboxes"));
		const trials = await runMatrix(config, buildMatrix([dryCandidate], 1), {
			provider,
			registry: dryRegistry,
			runDir,
			prdContent: target.prdContent,
			prdSha256: target.prdSha256,
			testPlanSha256: target.testPlanSha256,
			harnessVersion: "2.1.170",
			executeScript: fakeExecutor as never,
		});
		const trial = trials[0]!;
		expect(trial.provenance.status).toBe("completed");

		// Synthetic grading against the ADAPTED target's real plan.
		const stepResults: StepResult[] = target.plan.steps.map((s) => ({
			stepId: s.id,
			outcome: s.fatal ? "pass" : "partial",
			credit: s.fatal ? 1 : 0.5,
			evidence: "dry-run synthetic verdict",
		}));
		trial.grades = {
			trialId: trial.provenance.trialId,
			adherence: scoreAdherence(target.plan, stepResults),
			quality: {
				judgeModel: "dry-judge",
				criteria: [
					{ criterion: "tests", samples: [6], score: 6, justification: "dry" },
					{
						criterion: "architecture",
						samples: [6],
						score: 6,
						justification: "dry",
					},
					{
						criterion: "errorHandling",
						samples: [6],
						score: 6,
						justification: "dry",
					},
					{
						criterion: "deadCode",
						samples: [6],
						score: 6,
						justification: "dry",
					},
					{
						criterion: "documentation",
						samples: [6],
						score: 6,
						justification: "dry",
					},
				],
				score: 60,
			},
			integration: null,
			designAdherence: null,
		};

		const results = buildResults({
			runId: "run-dry-webapp",
			config,
			prdSha256: target.prdSha256,
			testPlanSha256: target.testPlanSha256,
			startedAt: trial.provenance.startedAt,
			endedAt: trial.provenance.endedAt,
			trials,
		});
		const resultsPath = writeResults(runDir, results);
		const scorecardPath = writeScorecard(runDir, results);

		const parsed = JSON.parse(readFileSync(resultsPath, "utf8"));
		expect(parsed.prdSha256).toBe(target.prdSha256);
		expect(parsed.scores[0].candidate).toBe("superpowers");
		// Fatal cold-start gate passed → adherence reflects the target's plan.
		expect(parsed.scores[0].dimensions.prdAdherence).toBeGreaterThan(0);

		const scorecard = readFileSync(scorecardPath, "utf8");
		expect(scorecard).toContain(`PRD SHA-256: \`${target.prdSha256}\``);
	}, 30000);
});

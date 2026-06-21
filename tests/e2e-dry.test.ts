import { afterAll, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SessionScriptResult } from "../src/driver/session";
import { scoreAdherence } from "../src/grading/evaluator";
import { loadTestPlan } from "../src/grading/testplan";
import { buildMatrix, runMatrix } from "../src/orchestrator/scheduler";
import { WorktreeProvider } from "../src/providers/worktree";
import { loadRegistry } from "../src/registry";
import { renderScorecard, writeScorecard } from "../src/report/markdown";
import { buildResults, writeResults } from "../src/report/results";
import {
	RunConfig,
	type SessionRecord,
	type StepResult,
	type TrialResult,
} from "../src/types";

const base = mkdtempSync(join(tmpdir(), "he-e2e-"));
const runDir = join(base, "run-dry-001");
mkdirSync(join(runDir, "trials"), { recursive: true });

afterAll(() => rmSync(base, { recursive: true, force: true }));

/**
 * 8.2 end-to-end dry run: one candidate, worktree provider, tiny stand-in
 * PRD, fake session executor (no Claude Code, no API spend), synthetic
 * grading — asserting the full artifact/report chain:
 * provision → install → "build" → archive(+redaction) → provenance →
 * grade → results.json → scorecard.md
 */
describe("e2e dry run (task 8.2)", () => {
	test("full artifact and report chain", async () => {
		const registry = loadRegistry("config/registry.yaml");
		const standInPrd = "# Tiny PRD\nBuild a hello CLI.\n";
		const config = RunConfig.parse({
			candidates: ["superpowers"],
			trialsPerCandidate: 1,
			provider: "worktree",
			concurrency: 1,
		});

		// Override install steps so the dry run never hits plugin marketplaces.
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

		const fakeSecret = "dtn_deadbeefdeadbeefdeadbeefdeadbeef00";
		const fakeExecutor = async (sandbox: {
			writeFile: (p: string, c: string) => Promise<void>;
		}): Promise<SessionScriptResult> => {
			// Simulate the agent building an artifact, leaking a secret into a log.
			await sandbox.writeFile("hello.ts", `console.log("Hello, world!");\n`);
			await sandbox.writeFile("setup.sh", "#!/bin/sh\nexit 0\n");
			await sandbox.writeFile("start.sh", "#!/bin/sh\nsleep 60\n");
			await sandbox.writeFile("build.log", `token=${fakeSecret}\n`);
			const record: SessionRecord = {
				sessionId: "dry-1",
				stepIndex: 0,
				durationMs: 120000,
				numTurns: 9,
				costUsd: 0.42,
				usage: {
					inputTokens: 5000,
					outputTokens: 1500,
					cacheReadTokens: 100,
					cacheCreationTokens: 50,
				},
				isError: false,
			};
			return {
				records: [record],
				transcripts: [`{"type":"result","leak":"${fakeSecret}"}`],
				status: "completed",
				cappedBy: null,
				notes: [],
			};
		};

		const provider = new WorktreeProvider(join(base, "sandboxes"));
		const plans = buildMatrix([dryCandidate], 1);
		const trials = await runMatrix(config, plans, {
			provider,
			registry: dryRegistry,
			runDir,
			prdContent: standInPrd,
			prdSha256: "dry-prd-hash",
			testPlanSha256: "dry-plan-hash",
			harnessVersion: "2.1.170",
			executeScript: fakeExecutor as never,
		});

		// Trial completed with telemetry and provenance on disk.
		expect(trials).toHaveLength(1);
		const trial = trials[0] as TrialResult;
		expect(trial.provenance.status).toBe("completed");
		expect(trial.telemetry?.totalCostUsd).toBe(0.42);
		const trialDir = join(runDir, "trials", trial.provenance.trialId);
		expect(existsSync(join(trialDir, "provenance.json"))).toBe(true);

		// Archived workspace exists and secrets were redacted everywhere.
		const archivedLog = readFileSync(
			join(trialDir, "workspace", "build.log"),
			"utf8",
		);
		expect(archivedLog).not.toContain(fakeSecret);
		const transcript = readFileSync(
			join(trialDir, "transcripts", "session-000.jsonl"),
			"utf8",
		);
		expect(transcript).not.toContain(fakeSecret);
		expect(
			readFileSync(join(trialDir, "workspace", "hello.ts"), "utf8"),
		).toContain("Hello");

		// Synthetic grading: real test plan, synthetic step results.
		const { plan } = loadTestPlan("targets/symphony-daemon/testplan.yaml");
		const stepResults: StepResult[] = plan.steps.map((s) => ({
			stepId: s.id,
			outcome: s.fatal ? "pass" : "partial",
			credit: s.fatal ? 1 : 0.5,
			evidence: "dry-run synthetic verdict",
		}));
		trial.grades = {
			trialId: trial.provenance.trialId,
			adherence: scoreAdherence(plan, stepResults),
			quality: {
				judgeModel: "dry-judge",
				criteria: [
					{
						criterion: "tests",
						samples: [6, 7, 7],
						score: 7,
						justification: "dry",
					},
					{
						criterion: "architecture",
						samples: [5, 5, 6],
						score: 5,
						justification: "dry",
					},
					{
						criterion: "errorHandling",
						samples: [6, 6, 6],
						score: 6,
						justification: "dry",
					},
					{
						criterion: "deadCode",
						samples: [8, 8, 8],
						score: 8,
						justification: "dry",
					},
					{
						criterion: "documentation",
						samples: [4, 5, 5],
						score: 5,
						justification: "dry",
					},
				],
				score: 62,
			},
			integration: null,
			designAdherence: null,
		};

		// Results JSON + scorecard.
		const results = buildResults({
			runId: "run-dry-001",
			config,
			prdSha256: "dry-prd-hash",
			testPlanSha256: "dry-plan-hash",
			startedAt: trial.provenance.startedAt,
			endedAt: trial.provenance.endedAt,
			trials,
		});
		const resultsPath = writeResults(runDir, results);
		const scorecardPath = writeScorecard(runDir, results);

		const parsed = JSON.parse(readFileSync(resultsPath, "utf8"));
		expect(parsed.schemaVersion).toBe(1);
		expect(parsed.scores[0].candidate).toBe("superpowers");
		expect(parsed.scores[0].dimensions.prdAdherence).toBeGreaterThan(50);
		expect(parsed.scores[0].dimensions.speed).toBe(100); // single candidate → degenerate 100

		const scorecard = readFileSync(scorecardPath, "utf8");
		expect(scorecard).toContain("# Harness Eval Scorecard");
		expect(scorecard).toContain("superpowers");
		expect(scorecard).toContain("PRD SHA-256: `dry-prd-hash`");
		expect(scorecard).toContain("2.0m agent time");

		// Re-weighting from stored scores only (grading-rubric spec).
		const reweighted = buildResults({
			runId: "run-dry-001",
			config,
			weights: {
				prdAdherence: 0.7,
				codeQuality: 0.1,
				speed: 0.1,
				tokenSpend: 0.1,
			},
			prdSha256: "dry-prd-hash",
			testPlanSha256: "dry-plan-hash",
			startedAt: trial.provenance.startedAt,
			endedAt: trial.provenance.endedAt,
			trials,
		});
		expect(reweighted.weights.prdAdherence).toBe(0.7);
		expect(reweighted.scores[0]?.composite).not.toBe(
			results.scores[0]?.composite,
		);
		expect(renderScorecard(reweighted)).toContain("70.0%");
	}, 30000);
});

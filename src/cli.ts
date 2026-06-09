#!/usr/bin/env bun
/**
 * harness-eval CLI.
 *
 *   bun run src/cli.ts validate
 *       Validate registry + test plan + PRD hash + fixture manifest.
 *
 *   bun run src/cli.ts run --candidates gsd,superpowers --trials 1 \
 *       [--provider worktree|daytona] [--snapshot harness-eval-base:v1] [--grade]
 *       Execute the matrix. Builds happen with real Claude Code sessions —
 *       REAL SPEND. --grade additionally runs evaluator+judge (API spend).
 *
 *   bun run src/cli.ts report <run-dir> [--weights a,q,s,t]
 *       (Re)generate results.json + scorecard.md from stored trials.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runEvaluator } from "./grading/evaluator";
import { loadManifest } from "./grading/integration";
import { judgeQuality } from "./grading/judge";
import { scrubWorkspace } from "./grading/scrub";
import { loadTestPlan } from "./grading/testplan";
import { buildMatrix, runMatrix } from "./orchestrator/scheduler";
import { DaytonaProvider } from "./providers/daytona";
import { WorktreeProvider } from "./providers/worktree";
import { loadRegistry, resolveCandidates } from "./registry";
import { writeScorecard } from "./report/markdown";
import { buildResults, writeResults } from "./report/results";
import { RunConfig, type TrialResult, Weights } from "./types";

const PRD_PATH = "prd/symphony-SPEC.md";
const REGISTRY_PATH = "config/registry.yaml";
const TESTPLAN_PATH = "config/testplan.yaml";
const MANIFEST_PATH = "config/fixtures-manifest.yaml";

function arg(name: string): string | undefined {
	const i = process.argv.indexOf(`--${name}`);
	return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
	return process.argv.includes(`--${name}`);
}

function prdSha256(): string {
	return createHash("sha256").update(readFileSync(PRD_PATH)).digest("hex");
}

async function cmdValidate(): Promise<void> {
	const registry = loadRegistry(REGISTRY_PATH);
	console.log(
		`registry OK: ${registry.candidates.map((c) => `${c.id}@${c.pinnedVersion}`).join(", ")}`,
	);
	const sha = prdSha256();
	const { plan, sha256 } = loadTestPlan(TESTPLAN_PATH, sha);
	console.log(
		`test plan OK: ${plan.steps.length} steps, sha ${sha256.slice(0, 12)}…, PRD ${sha.slice(0, 12)}…`,
	);
	const { manifest, sha256: msha } = loadManifest(MANIFEST_PATH);
	console.log(
		`fixture manifest OK: ${manifest.fixtures.length} fixtures, sha ${msha.slice(0, 12)}…`,
	);
}

async function cmdRun(): Promise<void> {
	const registry = loadRegistry(REGISTRY_PATH);
	const config = RunConfig.parse({
		candidates: (
			arg("candidates") ?? registry.candidates.map((c) => c.id).join(",")
		).split(","),
		trialsPerCandidate: Number(arg("trials") ?? 3),
		provider: arg("provider") ?? "daytona",
		concurrency: Number(arg("concurrency") ?? 2),
	});
	const candidates = resolveCandidates(
		registry,
		config.candidates,
		config.harness,
	);
	const sha = prdSha256();
	const { plan, sha256: planSha } = loadTestPlan(TESTPLAN_PATH, sha);

	const runId = `run-${new Date().toISOString().replace(/[:.]/g, "-")}`;
	const runDir = join("runs", runId);
	mkdirSync(join(runDir, "trials"), { recursive: true });

	const provider =
		config.provider === "daytona"
			? new DaytonaProvider(arg("snapshot") ?? "harness-eval-base:v1")
			: new WorktreeProvider(join(runDir, "sandboxes"));

	console.log(
		`run ${runId}: ${candidates.length} candidate(s) × ${config.trialsPerCandidate} trial(s) on ${provider.id}`,
	);
	console.log(
		`budget: $${config.budget.trialCostUsd}/trial, $${config.budget.runCostUsd}/run, ${config.budget.trialWallClockMs / 60000}m wall-clock/trial`,
	);

	const startedAt = new Date().toISOString();
	const trials = await runMatrix(
		config,
		buildMatrix(candidates, config.trialsPerCandidate),
		{
			provider,
			registry,
			runDir,
			prdContent: readFileSync(PRD_PATH, "utf8"),
			prdSha256: sha,
			testPlanSha256: planSha,
			harnessVersion: arg("harness-version") ?? "2.1.170",
		},
	);

	if (flag("grade")) {
		for (const trial of trials) {
			const trialDir = join(runDir, "trials", trial.provenance.trialId);
			const workspace = join(trialDir, "workspace");
			if (!existsSync(workspace)) continue;
			console.log(`grading ${trial.provenance.trialId}…`);
			writeFileSync(
				join(workspace, "SPEC-REFERENCE.md"),
				readFileSync(PRD_PATH),
			);
			const adherence = await runEvaluator(plan, {
				model: config.judgeModel,
				workspaceDir: workspace,
				mockLinearUrl: process.env.MOCK_LINEAR_URL ?? "http://localhost:4280",
				stubAppServerPath: join(
					import.meta.dir,
					"fixtures",
					"stub-app-server.ts",
				),
			});
			const blindDir = join(trialDir, "workspace-blind");
			scrubWorkspace(workspace, blindDir, registry.candidates);
			const quality = await judgeQuality({
				model: config.judgeModel,
				blindWorkspaceDir: blindDir,
			});
			trial.grades = {
				trialId: trial.provenance.trialId,
				adherence,
				quality,
				integration: null,
			};
			writeFileSync(
				join(trialDir, "grades.json"),
				JSON.stringify(trial.grades, null, 2),
			);
		}
	}

	const results = buildResults({
		runId,
		config,
		prdSha256: sha,
		testPlanSha256: planSha,
		startedAt,
		endedAt: new Date().toISOString(),
		trials,
	});
	console.log(`results: ${writeResults(runDir, results)}`);
	console.log(`scorecard: ${writeScorecard(runDir, results)}`);
}

async function cmdReport(): Promise<void> {
	const runDir = process.argv[3];
	if (!runDir || !existsSync(runDir))
		throw new Error("usage: report <run-dir> [--weights a,q,s,t]");
	const prior = JSON.parse(readFileSync(join(runDir, "results.json"), "utf8"));
	const trials: TrialResult[] = prior.trials;
	// Reattach grades persisted after the original results were written.
	for (const t of trials) {
		const gradesPath = join(
			runDir,
			"trials",
			t.provenance.trialId,
			"grades.json",
		);
		if (t.grades === null && existsSync(gradesPath)) {
			t.grades = JSON.parse(readFileSync(gradesPath, "utf8"));
		}
	}
	let weights: Weights | undefined;
	const w = arg("weights");
	if (w) {
		const [a, q, s, t] = w.split(",").map(Number);
		weights = Weights.parse({
			prdAdherence: a,
			codeQuality: q,
			speed: s,
			tokenSpend: t,
		});
	}
	const results = buildResults({
		runId: prior.runId,
		config: RunConfig.parse(prior.config),
		weights,
		prdSha256: prior.prdSha256,
		testPlanSha256: prior.testPlanSha256,
		startedAt: prior.startedAt,
		endedAt: prior.endedAt,
		trials,
	});
	console.log(`results: ${writeResults(runDir, results)}`);
	console.log(`scorecard: ${writeScorecard(runDir, results)}`);
}

const cmd = process.argv[2];
const commands: Record<string, () => Promise<void>> = {
	validate: cmdValidate,
	run: cmdRun,
	report: cmdReport,
};
const handler = commands[cmd ?? ""];
if (!handler) {
	console.error(
		"usage: cli.ts <validate|run|report> [options]   (see file header)",
	);
	process.exit(2);
}
await handler();

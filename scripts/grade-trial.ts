#!/usr/bin/env bun
/**
 * Grade an archived trial post-hoc:
 *   bun scripts/grade-trial.ts <run-dir> <trial-id> [--driver cc|sdk] [--fresh]
 *
 * Drivers:
 *   cc  (default) — graders hosted on headless Claude Code, billed to the
 *                   Max subscription via CLAUDE_CODE_OAUTH_TOKEN.
 *   sdk           — direct Anthropic SDK agent loops (temp 0); requires
 *                   ANTHROPIC_API_KEY with credit. (main-branch behavior)
 *
 * --fresh discards prior checkpoints/verdicts for a clean re-grade.
 *
 * Spawns a mock tracker, runs the adaptive evaluator (frozen test plan),
 * scrubs the workspace, runs the blind code-quality judge, writes grades.json.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { judgeQualityCC, runEvaluatorCC } from "../src/grading/cc-driver";
import { runEvaluator } from "../src/grading/evaluator";
import { judgeQuality } from "../src/grading/judge";
import { scrubWorkspace } from "../src/grading/scrub";
import { loadRegistry } from "../src/registry";
import { loadTarget, startFixtures, stopFixtures } from "../src/targets";

const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const [runDir, trialId] = positional;
if (!runDir || !trialId)
	throw new Error(
		"usage: grade-trial.ts <run-dir> <trial-id> [--driver cc|sdk] [--fresh]",
	);
const driverIdx = process.argv.indexOf("--driver");
const driver = driverIdx >= 0 ? process.argv[driverIdx + 1] : "cc";
if (driver !== "cc" && driver !== "sdk")
	throw new Error(`unknown driver ${driver}`);
const fresh = process.argv.includes("--fresh");

const trialDir = join(runDir, "trials", trialId);
const workspace = join(trialDir, "workspace");
if (!existsSync(workspace)) throw new Error(`no workspace at ${workspace}`);

const registry = loadRegistry("config/registry.yaml");
const targetIdx = process.argv.indexOf("--target");
const target = loadTarget(
	targetIdx >= 0 ? (process.argv[targetIdx + 1] as string) : "symphony-daemon",
);
const { plan } = target;
const judgeModel = "claude-sonnet-4-6";

const checkpointFiles = [
	"evaluator-checkpoint.json",
	"judge-checkpoint.json",
	"cc-verdicts.jsonl",
];
if (fresh) {
	for (const f of checkpointFiles) rmSync(join(trialDir, f), { force: true });
	console.log("[grade] --fresh: cleared prior checkpoints");
}

const mockPort = 4290 + Math.floor(Math.random() * 100);
const fixtures = startFixtures(target, mockPort);
await new Promise((r) => setTimeout(r, 500));

try {
	writeFileSync(join(workspace, "SPEC-REFERENCE.md"), target.prdContent);
	console.log(
		`[grade] evaluator starting (driver ${driver}, model ${judgeModel}, mock :${mockPort})`,
	);
	const stubPath =
		fixtures.find((f) => f.name === "stub-app-server")?.value ?? "";
	const checkpointPath = join(trialDir, "evaluator-checkpoint.json");
	const checkpoint: unknown[] = existsSync(checkpointPath)
		? JSON.parse(readFileSync(checkpointPath, "utf8"))
		: [];
	if (checkpoint.length)
		console.log(
			`[grade] resuming with ${checkpoint.length} checkpointed verdicts`,
		);
	const onRecord = (r: { stepId: string; outcome: string; credit: number }) => {
		checkpoint.push(r);
		writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
		console.log(`[grade] step ${r.stepId}: ${r.outcome} (credit ${r.credit})`);
	};
	const adherence =
		driver === "cc"
			? await runEvaluatorCC(plan, {
					model: judgeModel,
					workspaceDir: workspace,
					trialDir,
					mockLinearUrl:
						fixtures.find((f) => f.name === "mock-linear")?.value ??
						`http://localhost:${mockPort}`,
					stubAppServerPath: stubPath,
					onRecord,
				})
			: await runEvaluator(plan, {
					model: judgeModel,
					workspaceDir: workspace,
					mockLinearUrl:
						fixtures.find((f) => f.name === "mock-linear")?.value ??
						`http://localhost:${mockPort}`,
					stubAppServerPath: stubPath,
					preRecorded: checkpoint as never,
					onRecord,
				});
	console.log(
		`[grade] adherence: graded=${adherence.gradedScore} pass@1=${adherence.passAt1} completeFailure=${adherence.completeFailure}`,
	);

	const blindDir = join(trialDir, "workspace-blind");
	const removed = scrubWorkspace(workspace, blindDir, registry.candidates);
	console.log(`[grade] scrubbed markers: ${removed.join(", ") || "none"}`);
	const judgeCkptPath = join(trialDir, "judge-checkpoint.json");
	const judgeCkpt: unknown[] = existsSync(judgeCkptPath)
		? JSON.parse(readFileSync(judgeCkptPath, "utf8"))
		: [];
	if (judgeCkpt.length)
		console.log(
			`[grade] judge resuming with ${judgeCkpt.length} criteria scored`,
		);
	const onCriterion = (c: {
		criterion: string;
		score: number;
		samples: number[];
	}) => {
		judgeCkpt.push(c);
		writeFileSync(judgeCkptPath, JSON.stringify(judgeCkpt, null, 2));
		console.log(
			`[grade] criterion ${c.criterion}: ${c.score} (samples ${c.samples})`,
		);
	};
	let quality = null;
	try {
		quality =
			driver === "cc"
				? await judgeQualityCC({
						model: judgeModel,
						blindWorkspaceDir: blindDir,
						preScored: judgeCkpt as never,
						onCriterion,
					})
				: await judgeQuality({
						model: judgeModel,
						blindWorkspaceDir: blindDir,
						preScored: judgeCkpt as never,
						onCriterion,
					});
		console.log(`[grade] quality: ${quality.score}`);
	} catch (err) {
		console.log(
			`[grade] judge failed (${String(err).slice(0, 120)}); writing partial grades`,
		);
	}

	writeFileSync(
		join(trialDir, "grades.json"),
		JSON.stringify(
			{ trialId, adherence, quality, integration: null, gradingDriver: driver },
			null,
			2,
		),
	);
	console.log(
		`[grade] wrote ${join(trialDir, "grades.json")} (quality ${quality ? "complete" : "PENDING — rerun to finish judge"})`,
	);
} finally {
	stopFixtures(fixtures);
}

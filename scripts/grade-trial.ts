#!/usr/bin/env bun
/**
 * Grade an archived trial post-hoc:
 *   bun scripts/grade-trial.ts <run-dir> <trial-id>
 * Spawns a mock tracker, runs the adaptive evaluator (frozen test plan),
 * scrubs the workspace, runs the blind code-quality judge, writes
 * grades.json, and regenerates results.json + scorecard.md.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runEvaluator } from "../src/grading/evaluator";
import { judgeQuality } from "../src/grading/judge";
import { scrubWorkspace } from "../src/grading/scrub";
import { loadTestPlan } from "../src/grading/testplan";
import { loadRegistry } from "../src/registry";

const [runDir, trialId] = process.argv.slice(2);
if (!runDir || !trialId) throw new Error("usage: grade-trial.ts <run-dir> <trial-id>");
const trialDir = join(runDir, "trials", trialId);
const workspace = join(trialDir, "workspace");
if (!existsSync(workspace)) throw new Error(`no workspace at ${workspace}`);

const registry = loadRegistry("config/registry.yaml");
const { plan } = loadTestPlan("config/testplan.yaml");
const judgeModel = "claude-sonnet-4-6";

const mockPort = 4290 + Math.floor(Math.random() * 100);
const mock = Bun.spawn(["bun", "src/fixtures/mock-linear.ts", String(mockPort)], {
	stdout: "ignore",
	stderr: "ignore",
});
await new Promise((r) => setTimeout(r, 500));

try {
	writeFileSync(join(workspace, "SPEC-REFERENCE.md"), readFileSync("prd/symphony-SPEC.md"));
	console.log(`[grade] evaluator starting (model ${judgeModel}, mock :${mockPort})`);
	const checkpointPath = join(trialDir, "evaluator-checkpoint.json");
	const checkpoint: unknown[] = existsSync(checkpointPath)
		? JSON.parse(readFileSync(checkpointPath, "utf8"))
		: [];
	if (checkpoint.length) console.log(`[grade] resuming with ${checkpoint.length} checkpointed verdicts`);
	const adherence = await runEvaluator(plan, {
		model: judgeModel,
		workspaceDir: workspace,
		mockLinearUrl: `http://localhost:${mockPort}`,
		stubAppServerPath: join(import.meta.dir, "..", "src", "fixtures", "stub-app-server.ts"),
		preRecorded: checkpoint as never,
		onRecord: (r) => {
			checkpoint.push(r);
			writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
			console.log(`[grade] step ${r.stepId}: ${r.outcome} (credit ${r.credit})`);
		},
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
	if (judgeCkpt.length) console.log(`[grade] judge resuming with ${judgeCkpt.length} criteria scored`);
	let quality = null;
	try {
		quality = await judgeQuality({
			model: judgeModel,
			blindWorkspaceDir: blindDir,
			preScored: judgeCkpt as never,
			onCriterion: (c) => {
				judgeCkpt.push(c);
				writeFileSync(judgeCkptPath, JSON.stringify(judgeCkpt, null, 2));
				console.log(`[grade] criterion ${c.criterion}: ${c.score} (samples ${c.samples})`);
			},
		});
		console.log(`[grade] quality: ${quality.score}`);
	} catch (err) {
		console.log(`[grade] judge failed (${String(err).slice(0, 120)}); writing partial grades`);
	}

	writeFileSync(
		join(trialDir, "grades.json"),
		JSON.stringify({ trialId, adherence, quality, integration: null }, null, 2),
	);
	console.log(`[grade] wrote ${join(trialDir, "grades.json")} (quality ${quality ? "complete" : "PENDING — rerun to finish judge"})`);
} finally {
	mock.kill();
}

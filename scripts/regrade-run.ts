#!/usr/bin/env bun
/**
 * Resume grading for an existing run — no rebuild. Grades every built-but-ungraded
 * trial on the subscription (cc driver, which resumes from per-trial checkpoints),
 * then assembles results.json + scorecard via finalize-run. Writes run-state.json
 * throughout so the studio shows live progress and the "Resume grading" button
 * clears when it's done.
 *
 *   bun scripts/regrade-run.ts runs/<runId>
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { gradeTrials } from "../src/orchestrator/grade";
import { loadRegistry } from "../src/registry";
import { type RunState, readRunState, writeRunState } from "../src/studio/run-state";
import { loadTarget } from "../src/targets";
import type { TrialProvenance, TrialResult } from "../src/types";

const runDir = process.argv[2];
if (!runDir || !existsSync(runDir)) {
	console.error("usage: regrade-run <run-dir>");
	process.exit(1);
}
const runId = basename(runDir);
const trialsDir = join(runDir, "trials");

const trialIds = readdirSync(trialsDir).filter((d) =>
	existsSync(join(trialsDir, d, "provenance.json")),
);
const provs = trialIds.map(
	(id) =>
		JSON.parse(
			readFileSync(join(trialsDir, id, "provenance.json"), "utf8"),
		) as TrialProvenance,
);
if (provs.length === 0) {
	console.error("no trials with provenance");
	process.exit(1);
}

/** Resolve the run's eval target by matching its PRD content hash. */
const sha = provs[0]?.prdSha256;
let target = null as ReturnType<typeof loadTarget> | null;
for (const d of readdirSync("targets")) {
	if (!existsSync(join("targets", d, "target.yaml"))) continue;
	try {
		const t = loadTarget(d);
		if (t.prdSha256 === sha) {
			target = t;
			break;
		}
	} catch {
		// skip
	}
}
if (!target) {
	console.error(`could not resolve target for prdSha ${sha}`);
	process.exit(1);
}
const registry = loadRegistry("config/registry.yaml");

// Built (completed) trials that have no grades.json yet.
const toGrade: TrialResult[] = trialIds
	.map((id, i) => ({ id, prov: provs[i] as TrialProvenance }))
	.filter(
		({ id, prov }) =>
			prov.status === "completed" &&
			existsSync(join(trialsDir, id, "workspace")) &&
			!existsSync(join(trialsDir, id, "grades.json")),
	)
	.map(({ prov }) => ({ provenance: prov, telemetry: null, grades: null }));

const candidates = [...new Set(provs.map((p) => p.candidate))];
const base = (): RunState =>
	readRunState(runDir) ?? {
		runId,
		kind: "live",
		status: "running",
		stage: "grading",
		candidates,
		trials: {},
		costUsdSoFar: 0,
		startedAt: provs[0]?.startedAt ?? new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		ownerPid: process.pid,
		error: null,
	};
const setState = (over: Partial<RunState>) =>
	writeRunState(runDir, {
		...base(),
		ownerPid: process.pid,
		updatedAt: new Date().toISOString(),
		...over,
	});

setState({ status: "running", stage: "grading", error: null });
console.log(`regrade ${runId}: ${toGrade.length} trial(s) to grade`);

if (toGrade.length > 0) {
	await gradeTrials(toGrade, {
		target,
		design: null,
		registry,
		judgeModel: "claude-sonnet-4-6",
		runDir,
		driver: "cc",
		log: (m) => console.log(m),
		onStage: (stage) => setState({ status: "running", stage }),
	});
}

setState({ status: "running", stage: "finalizing" });
const fin = spawnSync("bun", ["scripts/finalize-run.ts", runDir], {
	stdio: "inherit",
});
setState({
	status: fin.status === 0 ? "completed" : "error",
	stage: null,
	error: fin.status === 0 ? null : "finalize failed",
});
process.exit(fin.status ?? 0);

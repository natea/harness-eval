#!/usr/bin/env bun
/**
 * Grade brownfield trials in a finished run that have no resolution yet (e.g. a
 * trial skipped by a since-corrected audit finding).
 *
 *   bun run scripts/grade-run.ts runs/<run-id> [--clone <path>]
 *
 * Uses the sealed-repo cache; no model spend.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadBundle, readText } from "../src/brownfield/bundle";
import { gradeCandidate, writeGrade } from "../src/brownfield/trial-grade";
import { ensureSealedRepo } from "../src/brownfield/seed";
import { writeBrownfieldReport } from "../src/report/brownfield";
import type { RunResults } from "../src/types";

const runDir = process.argv[2];
if (!runDir || !existsSync(join(runDir, "results.json")))
	throw new Error(
		"usage: bun run scripts/grade-run.ts runs/<run-id> [--clone <path>]",
	);
const cloneIdx = process.argv.indexOf("--clone");
const clone =
	cloneIdx > 0
		? (process.argv[cloneIdx + 1] as string)
		: "/home/pacel/misc/scienceclaw-hack/clones/paper-qa";

const results = JSON.parse(
	readFileSync(join(runDir, "results.json"), "utf8"),
) as RunResults;

for (const trial of results.trials) {
	const ref = trial.provenance.brownfield;
	if (!ref) continue;
	if (
		trial.resolution?.verdict === "resolved" ||
		trial.resolution?.verdict === "unresolved"
	)
		continue;
	const bundle = loadBundle(
		join("brownfield", ref.repoDir, "tasks", ref.taskId),
		{
			verify: false,
		},
	);
	const trialDir = join(runDir, "trials", trial.provenance.trialId);
	const patchPath = join(trialDir, "candidate.patch");
	const sealed = await ensureSealedRepo({
		clone,
		baseSha: ref.baseSha,
		futureShas: [ref.mergeSha],
		repoDir: ref.repoDir,
	});
	const grade = await gradeCandidate({
		sealedDir: sealed,
		candidatePatch: existsSync(patchPath)
			? readFileSync(patchPath, "utf8")
			: "",
		manifest: {
			failToPass: bundle.manifest.failToPass,
			passToPass: bundle.manifest.passToPass,
			testPaths: bundle.manifest.testPaths,
			env: bundle.manifest.env,
		},
		testsPatch: readText(bundle.dir, "tests.patch") ?? "",
		workDir: join(runDir, "grading", trial.provenance.trialId),
	});
	writeGrade(trialDir, grade);
	rmSync(join(runDir, "grading", trial.provenance.trialId, "repo"), {
		recursive: true,
		force: true,
	});
	trial.resolution = {
		verdict: grade.verdict,
		reason: grade.reason,
		failToPass: grade.failToPass,
		passToPass: grade.passToPass,
		testInfraModified: grade.testInfraModified,
		cassetteMiss: grade.cassetteMiss,
	};
	console.log(
		`${trial.provenance.trialId}: ${grade.verdict} (${grade.reason ?? "ok"})`,
	);
}

writeFileSync(
	join(runDir, "results.json"),
	`${JSON.stringify(results, null, 2)}\n`,
);
console.log(writeBrownfieldReport(runDir, results));

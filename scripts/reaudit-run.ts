#!/usr/bin/env bun
/**
 * Re-run the solution-reach audit over a finished run and refresh its artifacts.
 *
 *   bun run scripts/reaudit-run.ts runs/<run-id>
 *
 * Use after a fix to the audit rules: it rewrites each trial's `audit.json`,
 * clears a `solution-reach` resolution that no longer holds (grading must then be
 * re-run separately), and regenerates `brownfield.md`.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { auditFiles } from "../src/brownfield/audit";
import { loadBundle } from "../src/brownfield/bundle";
import { writeBrownfieldReport } from "../src/report/brownfield";
import type { RunResults } from "../src/types";

const runDir = process.argv[2];
if (!runDir || !existsSync(join(runDir, "results.json")))
	throw new Error("usage: bun run scripts/reaudit-run.ts runs/<run-id>");

const results = JSON.parse(
	readFileSync(join(runDir, "results.json"), "utf8"),
) as RunResults;

for (const trial of results.trials) {
	const ref = trial.provenance.brownfield;
	if (!ref) continue;
	const bundle = loadBundle(
		join("brownfield", ref.repoDir, "tasks", ref.taskId),
		{
			verify: false,
		},
	);
	const trialDir = join(runDir, "trials", trial.provenance.trialId);
	const transcriptDir = join(trialDir, "transcripts");
	const files = existsSync(transcriptDir)
		? readdirSync(transcriptDir)
				.filter((f) => f.endsWith(".jsonl"))
				.map((f) => join(transcriptDir, f))
		: [];
	const audit = auditFiles(files, {
		futureShas: [ref.mergeSha],
		prNumber: bundle.manifest.pr,
		repo: bundle.manifest.repo,
	});
	writeFileSync(
		`${trialDir}/audit.json`,
		`${JSON.stringify(audit, null, 2)}\n`,
	);
	const prior = trial.resolution;
	if (
		audit.verdict !== "disqualified:solution-reach" &&
		prior?.reason === "solution-reach"
	) {
		// Grading was skipped; leave it null so `report` shows "not graded".
		trial.resolution = null;
		console.log(
			`${trial.provenance.trialId}: cleared solution-reach (grading was skipped)`,
		);
	} else {
		console.log(`${trial.provenance.trialId}: ${audit.verdict}`);
	}
}

writeFileSync(
	join(runDir, "results.json"),
	`${JSON.stringify(results, null, 2)}\n`,
);
console.log(writeBrownfieldReport(runDir, results));

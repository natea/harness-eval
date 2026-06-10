#!/usr/bin/env bun
/**
 * Build a combined cross-run leaderboard from multiple run directories:
 *   bun scripts/combined-report.ts <out-dir> <run-dir> [<run-dir>...]
 * Merges all countable trials (grades reattached from grades.json), scores
 * them as one matrix (speed/spend normalized across the merged candidate
 * set), and writes results.json + scorecard.md to <out-dir>.
 *
 * Caveat recorded in the output: merging runs is only fair while config
 * (PRD, test plan, budgets, model, harness) is identical across them.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeScorecard } from "../src/report/markdown";
import { buildResults, writeResults } from "../src/report/results";
import { RunConfig, type TrialResult } from "../src/types";

const [outDir, ...runDirs] = process.argv.slice(2);
if (!outDir || runDirs.length === 0)
	throw new Error("usage: combined-report.ts <out-dir> <run-dir>...");

const trials: TrialResult[] = [];
let config: RunConfig | null = null;
let prdSha256 = "";
let testPlanSha256: string | null = null;
let startedAt = "";
let endedAt: string | null = null;

for (const dir of runDirs) {
	const results = JSON.parse(readFileSync(join(dir, "results.json"), "utf8"));
	config ??= RunConfig.parse(results.config);
	prdSha256 ||= results.prdSha256;
	testPlanSha256 ??= results.testPlanSha256;
	if (!startedAt || results.startedAt < startedAt) startedAt = results.startedAt;
	if (results.endedAt && (!endedAt || results.endedAt > endedAt)) endedAt = results.endedAt;
	if (results.prdSha256 !== prdSha256)
		throw new Error(`PRD hash mismatch in ${dir} — runs are not comparable`);
	for (const t of results.trials as TrialResult[]) {
		const gradesPath = join(dir, "trials", t.provenance.trialId, "grades.json");
		if (t.grades === null && existsSync(gradesPath)) {
			t.grades = JSON.parse(readFileSync(gradesPath, "utf8"));
		}
		trials.push(t);
	}
}

if (!config) throw new Error("no runs loaded");
mkdirSync(outDir, { recursive: true });
const combined = buildResults({
	runId: `combined:${runDirs.map((d) => d.split("/").at(-1)).join("+")}`,
	config,
	prdSha256,
	testPlanSha256,
	startedAt,
	endedAt,
	trials,
});
console.log(`results: ${writeResults(outDir, combined)}`);
console.log(`scorecard: ${writeScorecard(outDir, combined)}`);
for (const s of combined.scores) {
	console.log(
		`${s.candidate}: composite ${s.composite} | adherence ${s.dimensions.prdAdherence} | quality ${s.dimensions.codeQuality} | speed ${s.dimensions.speed} | spend ${s.dimensions.tokenSpend} (${s.trialsCounted} trial[s])`,
	);
}

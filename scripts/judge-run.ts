#!/usr/bin/env bun
/**
 * Judge already-finished brownfield trials that have no judge signal (task 5.2).
 *
 *   bun run scripts/judge-run.ts runs/<run-id> [--profile claude-sonnet-4-6-key] [--candidate <id>]
 *
 * Costs one model call per trial; the judge must differ from the worker model.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadBundle, readSnapshot, readText } from "../src/brownfield/bundle";
import { assertClassifierIndependent } from "../src/brownfield/classify";
import { judgeCandidate } from "../src/brownfield/judge";
import { resolveClaudeCodeEnv, resolveProfile } from "../src/models";
import { writeBrownfieldReport } from "../src/report/brownfield";
import type { RunResults } from "../src/types";

const runDir = process.argv[2];
if (!runDir || !existsSync(join(runDir, "results.json")))
	throw new Error(
		"usage: bun run scripts/judge-run.ts runs/<run-id> [--profile <name>]",
	);

const modelIdx = process.argv.indexOf("--profile");
const profileRef = modelIdx > 0 ? process.argv[modelIdx + 1] : "claude-sonnet-4-6-key";
if (!profileRef) throw new Error("--profile needs a value");
const { loadModels } = await import("../src/models");
const profile = resolveProfile(profileRef, loadModels());
const codeEnv = resolveClaudeCodeEnv(profile);
const modelId = profile.modelId;

// Re-judge one candidate (e.g. after a judge fix); the earlier verdict is overwritten.
const only = process.argv.includes("--candidate")
	? process.argv[process.argv.indexOf("--candidate") + 1]
	: undefined;
const resultsPath = join(runDir, "results.json");
const results = JSON.parse(readFileSync(resultsPath, "utf8")) as RunResults;

for (const trial of results.trials) {
	const ref = trial.provenance.brownfield;
	if (!ref) continue;
	if (only ? trial.provenance.candidate !== only : trial.judge) continue;
	if (trial.resolution?.reason === "solution-reach") continue;
	assertClassifierIndependent(modelId, trial.provenance.model ?? modelId);
	const trialDir = join(runDir, "trials", trial.provenance.trialId);
	const patchPath = join(trialDir, "candidate.patch");
	if (!existsSync(patchPath)) continue;
	const dir = join("brownfield", ref.repoDir, "tasks", ref.taskId);
	const bundle = loadBundle(dir);
	const snapshot = readSnapshot(bundle.dir);
	const judge = await judgeCandidate(
		{
			issueTitle: snapshot.title,
			issueBody: snapshot.body,
			referencePatch: readText(bundle.dir, "reference.patch") ?? "",
			candidatePatch: readFileSync(patchPath, "utf8"),
		},
		{ model: codeEnv.modelFlag, env: codeEnv.env },
	);
	writeFileSync(
		join(trialDir, "judge.json"),
		`${JSON.stringify({ ...judge, model: modelId }, null, 2)}\n`,
	);
	trial.judge = { ...judge, model: modelId };
	console.log(
		`judge ${trial.provenance.trialId}: ${judge.quality} (${judge.resolvesIssue ? "resolves" : "does not resolve"}) $${judge.costUsd.toFixed(3)}`,
	);
}

writeFileSync(resultsPath, `${JSON.stringify(results, null, 2)}\n`);
console.log(`brownfield report: ${writeBrownfieldReport(runDir, results)}`);

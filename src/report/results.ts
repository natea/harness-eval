import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { isInconclusive, scoreRun } from "../grading/scoring";
import {
	type RunConfig,
	RunResults,
	type TrialResult,
	type Weights,
} from "../types";

export interface BuildResultsInput {
	runId: string;
	config: RunConfig;
	/** Allows re-weighting at report time without re-running (grading-rubric spec). */
	weights?: Weights;
	prdSha256: string;
	testPlanSha256: string | null;
	startedAt: string;
	endedAt: string | null;
	trials: TrialResult[];
}

/**
 * Build the machine-readable results document (task 7.1). Stable schema
 * (schemaVersion 1) keyed by candidate/harness/model for cross-run and
 * cross-harness comparison.
 */
export function buildResults(input: BuildResultsInput): RunResults {
	const weights = input.weights ?? input.config.weights;
	const scores = scoreRun({
		harness: input.config.harness,
		model: input.config.model,
		weights,
		trials: input.trials,
	});
	const exclusions = input.trials
		.filter(
			(t) =>
				t.provenance.status === "infra-failed" ||
				t.provenance.status === "skipped:budget",
		)
		.map((t) => ({
			trialId: t.provenance.trialId,
			status: t.provenance.status,
			reason: t.provenance.notes.at(-1) ?? t.provenance.status,
		}));
	return RunResults.parse({
		schemaVersion: 1,
		runId: input.runId,
		config: input.config,
		weights,
		prdSha256: input.prdSha256,
		testPlanSha256: input.testPlanSha256,
		startedAt: input.startedAt,
		endedAt: input.endedAt,
		scores,
		trials: input.trials,
		exclusions,
		inconclusive: isInconclusive(scores),
	});
}

export function writeResults(runDir: string, results: RunResults): string {
	const path = join(runDir, "results.json");
	writeFileSync(path, JSON.stringify(results, null, 2));
	return path;
}

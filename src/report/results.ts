import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { isInconclusive, scoreRun } from "../grading/scoring";
import {
	type CostSource,
	type ModelRef,
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
	/** Resolved model profiles + caveats (model-registry). */
	workerModel?: ModelRef;
	judgeModel?: ModelRef;
	crossVendorJudge?: boolean;
	costSource?: CostSource;
}

/**
 * Build the machine-readable results document (task 7.1). Stable schema
 * (schemaVersion 1) keyed by candidate/harness/model for cross-run and
 * cross-harness comparison.
 */
export function buildResults(input: BuildResultsInput): RunResults {
	const weights = input.weights ?? input.config.weights;
	// Reconcile the embedded config with the resolved worker model so
	// `config.model` agrees with workerModel/provenance instead of keeping its
	// default while --worker-model is in effect (also fixes re-reported runs).
	const config = input.config;
	if (input.workerModel) config.model = input.workerModel.name;
	// Key scores by the resolved worker model when present.
	const scores = scoreRun({
		harness: config.harness,
		model: input.workerModel?.name ?? config.model,
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
		workerModel: input.workerModel,
		judgeModel: input.judgeModel,
		crossVendorJudge: input.crossVendorJudge ?? false,
		costSource: input.costSource ?? "harness-reported",
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

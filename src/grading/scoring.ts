import type {
	CandidateScore,
	Dimension,
	DimensionStats,
	HarnessId,
	TrialResult,
	Weights,
} from "../types";

export function stats(values: number[]): DimensionStats {
	if (values.length === 0) return { mean: 0, min: 0, max: 0, stddev: 0 };
	const mean = values.reduce((a, b) => a + b, 0) / values.length;
	const variance =
		values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
	return {
		mean,
		min: Math.min(...values),
		max: Math.max(...values),
		stddev: Math.sqrt(variance),
	};
}

/**
 * Min-max normalize candidate means within the run matrix: best mean → 100,
 * worst → 0, linear in between (grading-rubric spec). `lowerIsBetter` for
 * duration/cost dimensions. All-equal degenerates to 100 for everyone.
 */
export function normalizeAcrossCandidates(
	meansByCandidate: Map<string, number>,
	lowerIsBetter: boolean,
): Map<string, number> {
	const values = [...meansByCandidate.values()];
	const min = Math.min(...values);
	const max = Math.max(...values);
	const out = new Map<string, number>();
	for (const [candidate, v] of meansByCandidate) {
		let score: number;
		if (max === min) score = 100;
		else if (lowerIsBetter) score = ((max - v) / (max - min)) * 100;
		else score = ((v - min) / (max - min)) * 100;
		out.set(candidate, Math.round(score * 100) / 100);
	}
	return out;
}

export function composite(
	dimensions: Record<Dimension, number>,
	weights: Weights,
): number {
	const value =
		dimensions.prdAdherence * weights.prdAdherence +
		dimensions.codeQuality * weights.codeQuality +
		dimensions.speed * weights.speed +
		dimensions.tokenSpend * weights.tokenSpend;
	return Math.round(value * 100) / 100;
}

export interface ScoringInput {
	harness: HarnessId;
	model: string;
	weights: Weights;
	trials: TrialResult[];
}

/** Trials that count toward scoring: completed or capped, with telemetry+grades. */
function countable(trials: TrialResult[]): TrialResult[] {
	return trials.filter(
		(t) =>
			(t.provenance.status === "completed" ||
				t.provenance.status === "capped") &&
			t.telemetry !== null &&
			t.grades !== null,
	);
}

/**
 * Compute per-candidate dimension scores and weighted composites (tasks
 * 6.6/6.7). Adherence/quality are absolute (0-100 already); speed and token
 * spend are normalized across candidate means within the run. Capped trials
 * flag the candidate as right-censored. Re-weighting needs only this
 * function and stored trials — no re-running or re-judging.
 */
export function scoreRun(input: ScoringInput): CandidateScore[] {
	const byCandidate = new Map<string, TrialResult[]>();
	for (const t of input.trials) {
		const list = byCandidate.get(t.provenance.candidate) ?? [];
		list.push(t);
		byCandidate.set(t.provenance.candidate, list);
	}

	const perCandidate = new Map<
		string,
		{
			adherence: number[];
			quality: number[];
			durationMs: number[];
			costUsd: number[];
			censored: boolean;
		}
	>();
	for (const [candidate, trials] of byCandidate) {
		const usable = countable(trials);
		perCandidate.set(candidate, {
			adherence: usable.map((t) => t.grades?.adherence?.gradedScore ?? 0),
			quality: usable.map((t) => t.grades?.quality?.score ?? 0),
			durationMs: usable.map((t) => t.telemetry?.agentDurationMs ?? 0),
			costUsd: usable.map((t) => t.telemetry?.totalCostUsd ?? 0),
			censored: trials.some((t) => t.provenance.status === "capped"),
		});
	}

	const durationMeans = new Map(
		[...perCandidate].map(([c, d]) => [c, stats(d.durationMs).mean]),
	);
	const costMeans = new Map(
		[...perCandidate].map(([c, d]) => [c, stats(d.costUsd).mean]),
	);
	const speedScores = normalizeAcrossCandidates(durationMeans, true);
	const spendScores = normalizeAcrossCandidates(costMeans, true);

	const results: CandidateScore[] = [];
	for (const [candidate, d] of perCandidate) {
		const dimensions: Record<Dimension, number> = {
			prdAdherence: Math.round(stats(d.adherence).mean * 100) / 100,
			codeQuality: Math.round(stats(d.quality).mean * 100) / 100,
			speed: speedScores.get(candidate) ?? 0,
			tokenSpend: spendScores.get(candidate) ?? 0,
		};
		// Per-trial composites for variance: speed/spend are per-run normalized,
		// so per-trial variance uses adherence/quality variation only.
		const perTrialComposites = d.adherence.map((a, i) =>
			composite(
				{
					prdAdherence: a,
					codeQuality: d.quality[i] ?? 0,
					speed: dimensions.speed,
					tokenSpend: dimensions.tokenSpend,
				},
				input.weights,
			),
		);
		results.push({
			candidate,
			harness: input.harness,
			model: input.model,
			dimensions,
			stats: {
				prdAdherence: stats(d.adherence),
				codeQuality: stats(d.quality),
				speed: stats(d.durationMs),
				tokenSpend: stats(d.costUsd),
			},
			composite: composite(dimensions, input.weights),
			compositeStats: stats(perTrialComposites),
			trialsCounted: d.adherence.length,
			rightCensored: d.censored,
		});
	}
	return results.sort((a, b) => b.composite - a.composite);
}

/** Top-two overlap check (eval-reporting spec: inconclusive ordering flag). */
export function isInconclusive(scores: CandidateScore[]): boolean {
	if (scores.length < 2) return false;
	const [a, b] = scores as [CandidateScore, CandidateScore];
	const aLow = a.composite - a.compositeStats.stddev;
	const bHigh = b.composite + b.compositeStats.stddev;
	return aLow <= bHigh;
}

/**
 * Arm comparison against blind human labels (add-task-curation-collective 4.3, D12).
 * Pure functions; the script in scripts/curate-compare.ts does the I/O.
 */
import { LEAK_LEVELS, type LeakLevel } from "../bundle";
import { agreement, type Pair } from "../agreement";

export interface BundleLabels {
	task: string;
	/** Human label per item id (latest review record). */
	human: Record<string, LeakLevel>;
	humanFairness: "fair" | "unfair" | "unsure";
	/** Per arm: item labels, fairness, spend, exclusion state. */
	arms: Record<
		string,
		{
			items: Record<string, LeakLevel | "unlabeled">;
			fairness: "fair" | "unfair" | "unsure";
			spendUsd: number;
			excluded: boolean;
		}
	>;
}

export const HUMAN_FAIRNESS = { yes: "fair", no: "unfair", unsure: "unsure" } as const;

export function pairsFor(bundles: BundleLabels[], arm: string): { pairs: Pair[]; unlabeled: number } {
	const pairs: Pair[] = [];
	let unlabeled = 0;
	for (const b of bundles) {
		const a = b.arms[arm];
		if (!a) continue;
		for (const [id, h] of Object.entries(b.human)) {
			const l = a.items[id];
			if (!l || l === "unlabeled") unlabeled++;
			else pairs.push([h, l]);
		}
	}
	return { pairs, unlabeled };
}

export interface ArmScore {
	arm: string;
	bundles: number;
	items: number;
	unlabeled: number;
	accuracy: number;
	kappa: number | null;
	weightedKappa: number | null;
	/** Items within one level of the human label. */
	withinOne: number;
	fairnessAgreement: number;
	meanSpendUsd: number;
	accuracyPerDollar: number | null;
	ci: { accuracy: [number, number]; kappa: [number, number] };
}

/** Deterministic PRNG (mulberry32) so CIs are reproducible. */
export function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const pct = (xs: number[], p: number) => {
	const s = [...xs].sort((a, b) => a - b);
	return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))] as number;
};

/** Resample bundles (not items) with replacement; returns B index draws. */
export function bundleResamples(n: number, B: number, seed = 42): number[][] {
	const r = rng(seed);
	return Array.from({ length: B }, () => Array.from({ length: n }, () => Math.floor(r() * n)));
}

const rank = (l: LeakLevel) => LEAK_LEVELS.indexOf(l);

export function scoreArm(bundles: BundleLabels[], arm: string, draws: number[][]): ArmScore {
	const { pairs, unlabeled } = pairsFor(bundles, arm);
	const ag = agreement(pairs);
	const fairHits = bundles.filter((b) => b.arms[arm]?.fairness === b.humanFairness).length;
	const meanSpend = bundles.reduce((s, b) => s + (b.arms[arm]?.spendUsd ?? 0), 0) / (bundles.length || 1);
	const accs: number[] = [];
	const kaps: number[] = [];
	for (const d of draws) {
		const sample = d.map((i) => bundles[i] as BundleLabels);
		const a = agreement(pairsFor(sample, arm).pairs);
		accs.push(a.observed);
		if (a.kappa != null) kaps.push(a.kappa);
	}
	return {
		arm,
		bundles: bundles.length,
		items: pairs.length,
		unlabeled,
		accuracy: ag.observed,
		kappa: ag.kappa,
		weightedKappa: ag.weightedKappa,
		withinOne: pairs.length ? pairs.filter(([h, l]) => Math.abs(rank(h) - rank(l)) <= 1).length / pairs.length : 0,
		fairnessAgreement: bundles.length ? fairHits / bundles.length : 0,
		meanSpendUsd: meanSpend,
		accuracyPerDollar: meanSpend > 0 ? ag.observed / meanSpend : null,
		ci: {
			accuracy: [pct(accs, 0.025), pct(accs, 0.975)],
			kappa: kaps.length ? [pct(kaps, 0.025), pct(kaps, 0.975)] : [Number.NaN, Number.NaN],
		},
	};
}

/** Bootstrap CI of κ(armA) − κ(armB) on the same bundle resamples. */
export function kappaDiffCI(bundles: BundleLabels[], a: string, b: string, draws: number[][]): [number, number, number] {
	const diffs: number[] = [];
	for (const d of draws) {
		const sample = d.map((i) => bundles[i] as BundleLabels);
		const ka = agreement(pairsFor(sample, a).pairs).kappa;
		const kb = agreement(pairsFor(sample, b).pairs).kappa;
		if (ka != null && kb != null) diffs.push(ka - kb);
	}
	const point = (agreement(pairsFor(bundles, a).pairs).kappa ?? 0) - (agreement(pairsFor(bundles, b).pairs).kappa ?? 0);
	return [point, pct(diffs, 0.025), pct(diffs, 0.975)];
}

/** Per-role vote accuracy (D12): votes are `item → level` (abstentions omitted). */
export function roleAccuracy(
	votes: { human: LeakLevel; vote: LeakLevel }[],
): { n: number; accuracy: number; higher: number; lower: number } {
	const n = votes.length;
	return {
		n,
		accuracy: n ? votes.filter((v) => v.vote === v.human).length / n : 0,
		higher: votes.filter((v) => rank(v.vote) > rank(v.human)).length,
		lower: votes.filter((v) => rank(v.vote) < rank(v.human)).length,
	};
}

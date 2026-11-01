/**
 * Agreement between human review labels and LLM leak labels (design D15).
 * Cohen's κ (unweighted) plus quadratic-weighted κ, since the leak scale is
 * ordinal: mislabeling `diagnosis` as `fix_sketch` is a smaller error than as
 * `noise`.
 */
import { LEAK_LEVELS, type LeakLevel } from "./bundle";

export type Pair = [human: LeakLevel, llm: LeakLevel];

export interface Agreement {
	n: number;
	/** Fraction of items where human and LLM chose the same level. */
	observed: number;
	kappa: number | null;
	weightedKappa: number | null;
	/** confusion[human][llm] = count. */
	confusion: Record<LeakLevel, Record<LeakLevel, number>>;
	/** Per-level: items the human gave this level, and how many the LLM matched. */
	perLevel: Record<LeakLevel, { human: number; llm: number; agree: number }>;
}

function emptyMatrix(): Record<LeakLevel, Record<LeakLevel, number>> {
	return Object.fromEntries(
		LEAK_LEVELS.map((h) => [
			h,
			Object.fromEntries(LEAK_LEVELS.map((l) => [l, 0])),
		]),
	) as Record<LeakLevel, Record<LeakLevel, number>>;
}

/**
 * κ = (po − pe) / (1 − pe), with disagreement weights w(i,j): 0/1 for unweighted,
 * ((i−j)/(k−1))² for quadratic. Returns null when undefined (no items, or both
 * raters used a single identical category so pe = 1).
 */
function kappaWith(
	m: Record<LeakLevel, Record<LeakLevel, number>>,
	n: number,
	weight: (i: number, j: number) => number,
): number | null {
	if (n === 0) return null;
	const k = LEAK_LEVELS.length;
	const rowTot = LEAK_LEVELS.map((h) =>
		LEAK_LEVELS.reduce((s, l) => s + m[h][l], 0),
	);
	const colTot = LEAK_LEVELS.map((l) =>
		LEAK_LEVELS.reduce((s, h) => s + m[h][l], 0),
	);
	let obs = 0;
	let exp = 0;
	for (let i = 0; i < k; i++)
		for (let j = 0; j < k; j++) {
			const w = weight(i, j);
			obs +=
				(w * m[LEAK_LEVELS[i] as LeakLevel][LEAK_LEVELS[j] as LeakLevel]) / n;
			exp += (w * (rowTot[i] as number) * (colTot[j] as number)) / (n * n);
		}
	if (exp === 0) return null;
	return 1 - obs / exp;
}

export function agreement(pairs: Pair[]): Agreement {
	const confusion = emptyMatrix();
	for (const [h, l] of pairs) confusion[h][l]++;
	const n = pairs.length;
	const perLevel = Object.fromEntries(
		LEAK_LEVELS.map((lvl) => [
			lvl,
			{
				human: pairs.filter(([h]) => h === lvl).length,
				llm: pairs.filter(([, l]) => l === lvl).length,
				agree: confusion[lvl][lvl],
			},
		]),
	) as Agreement["perLevel"];
	const k = LEAK_LEVELS.length;
	return {
		n,
		observed: n ? pairs.filter(([h, l]) => h === l).length / n : 0,
		kappa: kappaWith(confusion, n, (i, j) => (i === j ? 0 : 1)),
		weightedKappa: kappaWith(confusion, n, (i, j) => ((i - j) / (k - 1)) ** 2),
		confusion,
		perLevel,
	};
}

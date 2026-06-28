/**
 * Inverse-scaling aggregation (explore-inverse-scaling-report): for each
 * (target, harness, model) pair every framework candidate against its
 * same-harness no-framework baseline (bare / codex-baseline) and compute the
 * marginal gain on the two ABSOLUTE axes — adherence and code quality — never
 * the run-normalized composite/speed/tokenSpend.
 *
 * Shared by scripts/inverse-scaling-report.ts (CLI) and the studio endpoint so
 * both read one source of truth. Read-only over runs/*\/results.json; reattaches
 * post-hoc grades from trials/<id>/grades.json (the combined-report.ts pattern).
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadTarget } from "../targets";

export const BASELINES = new Set(["bare", "codex-baseline"]);
const MIN_N = 2; // a single trial is a point estimate, not a trend
const HIGH_SD = 15; // adherence stddev above this = unstable cell

export interface InvScaleCell {
	target: string;
	harness: string;
	model: string;
	framework: string;
	baselineCandidate: string;
	nF: number;
	adhF: number;
	sdF: number;
	nB: number;
	baselineAdh: number;
	sdB: number;
	adhGain: number;
	qualB: number | null;
	qualF: number | null;
	qualGain: number | null;
	flags: string[];
}
export interface InvScaleFit {
	slope: number;
	r: number;
	n: number;
}
export interface InverseScaling {
	runsScanned: number;
	cellCount: number;
	groupCount: number;
	rows: InvScaleCell[];
	orphanFrameworks: string[];
	baselineOnlyGroups: string[];
	fits: {
		adherenceAll: InvScaleFit | null;
		adherenceConfident: InvScaleFit | null;
		qualityAll: InvScaleFit | null;
		qualityConfident: InvScaleFit | null;
		perFramework: { framework: string; fit: InvScaleFit | null }[];
	};
}

type Trial = { adherence: number; quality: number | null };

// Append v to the array at key k, creating it if absent.
const pushTo = <K, V>(m: Map<K, V[]>, k: K, v: V): void => {
	const arr = m.get(k);
	if (arr) arr.push(v);
	else m.set(k, [v]);
};

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const stddev = (xs: number[]) => {
	if (xs.length < 2) return 0;
	const m = mean(xs);
	return Math.sqrt(
		mean(xs.map((x) => (x - m) ** 2)) * (xs.length / (xs.length - 1)),
	);
};
// Least-squares fit of y on x. null if <2 points or x has no variance.
export const fit = (pts: (readonly [number, number])[]): InvScaleFit | null => {
	const n = pts.length;
	if (n < 2) return null;
	const mx = mean(pts.map((p) => p[0]));
	const my = mean(pts.map((p) => p[1]));
	const sxx = pts.reduce((s, [x]) => s + (x - mx) ** 2, 0);
	const syy = pts.reduce((s, [, y]) => s + (y - my) ** 2, 0);
	const sxy = pts.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0);
	if (sxx === 0) return null;
	return { slope: sxy / sxx, r: syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy), n };
};

/** Scan a runs directory and build the inverse-scaling cells + cross-target fits. */
export async function buildInverseScaling(
	runsDir: string,
	targetsDir = "targets",
): Promise<InverseScaling> {
	// prdSha256 -> target name, from the CURRENT frozen targets.
	const targetBySha = new Map<string, string>();
	for (const name of readdirSync(targetsDir)) {
		if (!existsSync(join(targetsDir, name, "target.yaml"))) continue;
		try {
			targetBySha.set(loadTarget(name, targetsDir).prdSha256, name);
		} catch {
			/* skip unloadable target */
		}
	}
	const targetName = (sha: string) =>
		targetBySha.get(sha) ?? `unknown:${sha.slice(0, 8)}`;

	// key: target | harness | model | candidate
	const SEP = "|";
	const cells = new Map<string, Trial[]>();
	let runsScanned = 0;
	for (const d of readdirSync(runsDir)) {
		const rp = join(runsDir, d, "results.json");
		if (!existsSync(rp)) continue;
		const j = await Bun.file(rp).json();
		runsScanned++;
		const target = targetName(j.prdSha256);
		for (const t of j.trials ?? []) {
			const p = t.provenance;
			let g = t.grades;
			if (!(typeof g?.adherence?.gradedScore === "number")) {
				const gp = join(runsDir, d, "trials", p?.trialId ?? "", "grades.json");
				if (p?.trialId && existsSync(gp)) g = await Bun.file(gp).json();
			}
			const adh = g?.adherence?.gradedScore;
			if (typeof adh !== "number") continue;
			const qCrit = g?.quality?.criteria ?? [];
			const quality = qCrit.length
				? qCrit.reduce(
						(s: number, c: { score?: number }) => s + (c.score ?? 0),
						0,
					) / qCrit.length
				: null;
			const key = [target, p.harness, p.model, p.candidate].join(SEP);
			pushTo(cells, key, { adherence: adh, quality });
		}
	}

	type Group = {
		target: string;
		harness: string;
		model: string;
		cands: Map<string, Trial[]>;
	};
	const groups = new Map<string, Group>();
	for (const [key, trials] of cells) {
		const [target = "", harness = "", model = "", cand = ""] = key.split(SEP);
		const gk = [target, harness, model].join(SEP);
		let g = groups.get(gk);
		if (!g) {
			g = { target, harness, model, cands: new Map() };
			groups.set(gk, g);
		}
		g.cands.set(cand, trials);
	}

	const qualOf = (trials: Trial[]): number | null => {
		const qs = trials
			.map((t) => t.quality)
			.filter((q): q is number => q != null);
		return qs.length ? mean(qs) * 10 : null; // criteria 0-10 → 0-100 like adherence
	};

	const rows: InvScaleCell[] = [];
	const orphanFrameworks: string[] = [];
	const baselineOnlyGroups: string[] = [];
	for (const g of groups.values()) {
		const baseCand = [...g.cands.keys()].find((c) => BASELINES.has(c));
		const frameworks = [...g.cands.keys()].filter((c) => !BASELINES.has(c));
		if (!baseCand) {
			for (const f of frameworks)
				orphanFrameworks.push(`${f} @ ${g.harness}/${g.model}/${g.target}`);
			continue;
		}
		if (frameworks.length === 0) {
			baselineOnlyGroups.push(
				`${baseCand} @ ${g.harness}/${g.model}/${g.target}`,
			);
			continue;
		}
		const baseTrials = g.cands.get(baseCand) ?? [];
		const base = baseTrials.map((t) => t.adherence);
		const qualB = qualOf(baseTrials);
		for (const f of frameworks) {
			const fTrials = g.cands.get(f) ?? [];
			const fa = fTrials.map((t) => t.adherence);
			const qualF = qualOf(fTrials);
			rows.push({
				target: g.target,
				harness: g.harness,
				model: g.model,
				framework: f,
				baselineCandidate: baseCand,
				nF: fa.length,
				adhF: mean(fa),
				sdF: stddev(fa),
				nB: base.length,
				baselineAdh: mean(base),
				sdB: stddev(base),
				adhGain: mean(fa) - mean(base),
				qualB,
				qualF,
				qualGain: qualB != null && qualF != null ? qualF - qualB : null,
				flags: [
					...(fa.length < MIN_N || base.length < MIN_N ? ["low-n"] : []),
					...(stddev(fa) >= HIGH_SD ? ["high-σ"] : []),
				],
			});
		}
	}

	const confident = rows.filter((r) => r.flags.length === 0);
	const qRows = rows.filter((r) => r.qualB != null && r.qualGain != null);
	const qConf = confident.filter((r) => r.qualB != null && r.qualGain != null);
	const byFw = new Map<string, InvScaleCell[]>();
	for (const r of rows) pushTo(byFw, r.framework, r);

	return {
		runsScanned,
		cellCount: cells.size,
		groupCount: groups.size,
		rows,
		orphanFrameworks: orphanFrameworks.sort(),
		baselineOnlyGroups: baselineOnlyGroups.sort(),
		fits: {
			adherenceAll: fit(rows.map((r) => [r.baselineAdh, r.adhGain])),
			adherenceConfident: fit(confident.map((r) => [r.baselineAdh, r.adhGain])),
			qualityAll: fit(
				qRows.map((r) => [r.qualB as number, r.qualGain as number]),
			),
			qualityConfident: fit(
				qConf.map((r) => [r.qualB as number, r.qualGain as number]),
			),
			perFramework: [...byFw]
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([framework, rs]) => ({
					framework,
					fit: fit(rs.map((r) => [r.baselineAdh, r.adhGain])),
				})),
		},
	};
}

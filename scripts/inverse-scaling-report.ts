#!/usr/bin/env bun
/**
 * PROTOTYPE — inverse-scaling report (task 2.1 / 3.1 of explore-inverse-scaling-report).
 *
 * Read-only over runs/*\/results.json. For each (target, harness, model) it pairs
 * every framework candidate against its same-harness no-framework baseline
 * (bare / codex-baseline) and computes:
 *
 *   baselineStrength(M,T)   = mean absolute PRD-adherence of the baseline
 *   marginalGain(F,M,T)     = mean adherence(F) - mean adherence(baseline)
 *
 * Pools at the TRIAL level (grades.adherence.gradedScore — absolute 0-100),
 * never the run-normalized composite/speed/tokenSpend. Per-target, no PRD
 * pooling: cells join across runs only when they share the frozen prdSha256.
 *
 * Emits a coverage verdict first (the point of the prototype), then the table
 * and per-target slope where data exists.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadTarget } from "../src/targets";

const REPO = new URL("..", import.meta.url).pathname;
const RUNS = join(REPO, "runs");
const BASELINES = new Set(["bare", "codex-baseline"]);

// prdSha256 -> target name, from the CURRENT frozen targets.
const targetBySha = new Map<string, string>();
for (const name of readdirSync(join(REPO, "targets"))) {
	if (!existsSync(join(REPO, "targets", name, "target.yaml"))) continue;
	try {
		targetBySha.set(loadTarget(name, join(REPO, "targets")).prdSha256, name);
	} catch {
		/* skip unloadable target */
	}
}
const targetName = (sha: string) =>
	targetBySha.get(sha) ?? `unknown:${sha.slice(0, 8)}`;

type Trial = { adherence: number; quality: number | null };
// key: target   harness   model   candidate
const cells = new Map<string, Trial[]>();
const candVersion = new Map<string, string>();

let runsScanned = 0;
for (const d of readdirSync(RUNS)) {
	const rp = join(RUNS, d, "results.json");
	if (!existsSync(rp)) continue;
	const j = await Bun.file(rp).json();
	runsScanned++;
	const target = targetName(j.prdSha256);
	for (const t of j.trials ?? []) {
		const p = t.provenance;
		// Grades embedded in results.json are null for trials graded post-hoc;
		// grade-trial.ts writes them to trials/<id>/grades.json. Reattach from
		// there (the combined-report.ts pattern) so post-hoc grades are counted.
		let g = t.grades;
		if (!(typeof g?.adherence?.gradedScore === "number")) {
			const gp = join(RUNS, d, "trials", p?.trialId ?? "", "grades.json");
			if (p?.trialId && existsSync(gp)) g = await Bun.file(gp).json();
		}
		const adh = g?.adherence?.gradedScore;
		if (typeof adh !== "number") continue; // ungraded / right-censored
		const qCrit = g?.quality?.criteria ?? [];
		const quality = qCrit.length
			? qCrit.reduce((s: number, c: any) => s + (c.score ?? 0), 0) /
				qCrit.length
			: null;
		const key = [target, p.harness, p.model, p.candidate].join(" ");
		(cells.get(key) ?? cells.set(key, []).get(key)!).push({
			adherence: adh,
			quality,
		});
		candVersion.set(key, p.candidateVersion ?? "?");
	}
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const stddev = (xs: number[]) => {
	if (xs.length < 2) return 0;
	const m = mean(xs);
	return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)) * (xs.length / (xs.length - 1)));
};

// Group cells by (target, harness, model).
type Group = { target: string; harness: string; model: string; cands: Map<string, Trial[]> };
const groups = new Map<string, Group>();
for (const [key, trials] of cells) {
	const [target = "", harness = "", model = "", cand = ""] = key.split(" ");
	const gk = [target, harness, model].join(" ");
	let g = groups.get(gk);
	if (!g) groups.set(gk, (g = { target, harness, model, cands: new Map() }));
	g.cands.set(cand, trials);
}

type Row = {
	target: string;
	harness: string;
	model: string;
	framework: string;
	nF: number;
	adhF: number;
	sdF: number;
	nB: number;
	baselineStrength: number;
	sdB: number;
	marginalGain: number;
	// codeQuality is the secondary axis (proposal: secondary y). Criteria scores
	// are 0-10; ×10 puts them on the same 0-100 scale as adherence. null when no
	// trial in the cell reported quality criteria.
	qualB: number | null;
	qualF: number | null;
	qualGain: number | null;
};
// Mean of per-trial quality (criteria mean ×10 → 0-100), or null if none scored.
const qualOf = (trials: Trial[]): number | null => {
	const qs = trials.map((t) => t.quality).filter((q): q is number => q != null);
	return qs.length ? mean(qs) * 10 : null;
};
const rows: Row[] = [];
const orphanFrameworks: string[] = [];
const baselineOnlyGroups: string[] = [];

for (const g of groups.values()) {
	const baseCand = [...g.cands.keys()].find((c) => BASELINES.has(c));
	const frameworks = [...g.cands.keys()].filter((c) => !BASELINES.has(c));
	if (!baseCand) {
		for (const f of frameworks)
			orphanFrameworks.push(`${f} @ ${g.harness}/${g.model}/${g.target} (no baseline)`);
		continue;
	}
	if (frameworks.length === 0) {
		baselineOnlyGroups.push(`${baseCand} @ ${g.harness}/${g.model}/${g.target}`);
		continue;
	}
	const baseTrials = g.cands.get(baseCand)!;
	const base = baseTrials.map((t) => t.adherence);
	const qualB = qualOf(baseTrials);
	for (const f of frameworks) {
		const fTrials = g.cands.get(f)!;
		const fa = fTrials.map((t) => t.adherence);
		const qualF = qualOf(fTrials);
		rows.push({
			target: g.target,
			harness: g.harness,
			model: g.model,
			framework: f,
			nF: fa.length,
			adhF: mean(fa),
			sdF: stddev(fa),
			nB: base.length,
			baselineStrength: mean(base),
			sdB: stddev(base),
			marginalGain: mean(fa) - mean(base),
			qualB,
			qualF,
			qualGain: qualB != null && qualF != null ? qualF - qualB : null,
		});
	}
}

// ---- Report ----
const fmt = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(1);
console.log(`# Inverse-Scaling Report (prototype)\n`);
console.log(`Scanned ${runsScanned} runs with results.json; ${cells.size} graded`);
console.log(`(target,harness,model,candidate) cells; ${groups.size} (target,harness,model) groups.\n`);

console.log(`## Coverage verdict\n`);
console.log(`Complete cells (framework AND same-harness baseline, both graded, same target+model): **${rows.length}**\n`);

if (rows.length === 0) {
	console.log(`No complete cells. The inverse-scaling curve CANNOT be computed from`);
	console.log(`current history — a deliberate baseline-coupling run set is required.\n`);
}

if (baselineOnlyGroups.length) {
	console.log(`Graded baselines with NO framework on the same harness/model/target:`);
	for (const b of baselineOnlyGroups.sort()) console.log(`  - ${b}`);
	console.log();
}
if (orphanFrameworks.length) {
	console.log(`Graded frameworks with NO same-harness baseline (the gap to close):`);
	for (const o of orphanFrameworks.sort()) console.log(`  - ${o}`);
	console.log();
}

if (rows.length) {
	console.log(`## Marginal gain table\n`);
	console.log(
		`Two absolute axes, never pooled: adherence (often ceilinged) and code quality (secondary).\n`,
	);
	console.log(
		`| target | harness | model | framework | base adh (n) | fwk adh (n) | **adh gain** | base qual | fwk qual | **qual gain** |`,
	);
	console.log(`|---|---|---|---|---|---|---|---|---|---|`);
	const q = (v: number | null) => (v == null ? "—" : v.toFixed(1));
	const qg = (v: number | null) => (v == null ? "—" : fmt(v));
	for (const r of rows.sort((a, b) => a.target.localeCompare(b.target) || b.marginalGain - a.marginalGain)) {
		console.log(
			`| ${r.target} | ${r.harness} | ${r.model} | ${r.framework} | ${r.baselineStrength.toFixed(1)}±${r.sdB.toFixed(1)} (${r.nB}) | ${r.adhF.toFixed(1)}±${r.sdF.toFixed(1)} (${r.nF}) | ${fmt(r.marginalGain)} | ${q(r.qualB)} | ${q(r.qualF)} | ${qg(r.qualGain)} |`,
		);
	}
	console.log();

	console.log(`## Per-target slope (marginal gain vs. baseline strength)\n`);
	const byTarget = new Map<string, Row[]>();
	for (const r of rows) (byTarget.get(r.target) ?? byTarget.set(r.target, []).get(r.target)!).push(r);
	for (const [target, rs] of byTarget) {
		const pts = rs.map((r) => [r.baselineStrength, r.marginalGain] as const);
		const n = pts.length;
		if (n < 2) {
			console.log(`- ${target}: ${n} point — slope undefined (need ≥2).`);
			continue;
		}
		const mx = mean(pts.map((p) => p[0]));
		const my = mean(pts.map((p) => p[1]));
		const num = pts.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0);
		const den = pts.reduce((s, [x]) => s + (x - mx) ** 2, 0);
		const slope = den === 0 ? Number.NaN : num / den;
		console.log(
			`- ${target}: ${n} points, slope ${Number.isNaN(slope) ? "n/a (no x-variance)" : slope.toFixed(2) + " gain-pts per +1 baseline-pt"}${slope < 0 ? "  (inverse-scaling shape)" : ""}`,
		);
	}
	console.log();
	console.log(`Caveat: gains measured on the eval set, not held-out tasks (HarnessX §7.7).`);
}

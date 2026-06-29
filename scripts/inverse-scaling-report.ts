#!/usr/bin/env bun
/**
 * Inverse-scaling report (explore-inverse-scaling-report). Thin CLI printer over
 * the shared aggregator in src/report/inverse-scaling.ts (one source of truth
 * with the studio /api/inverse-scaling endpoint).
 *
 *   bun scripts/inverse-scaling-report.ts
 *
 * For each (target, harness, model) it pairs every framework against its
 * same-harness no-framework baseline (bare / codex-baseline) and reports marginal
 * gain on the two ABSOLUTE axes — adherence and code quality — never the
 * run-normalized composite. Per-target, no PRD pooling; the inverse-scaling slope
 * is fit ACROSS targets where baseline strength varies.
 */
import { join } from "node:path";
import {
	buildInverseScaling,
	type InvScaleFit,
} from "../src/report/inverse-scaling";

const REPO = new URL("..", import.meta.url).pathname;
const data = await buildInverseScaling(
	join(REPO, "runs"),
	join(REPO, "targets"),
);

const fmt = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(1);
const q = (v: number | null) => (v == null ? "—" : v.toFixed(1));
const sign = (f: InvScaleFit | null) =>
	!f
		? "n/a (no x-variance)"
		: `${f.slope.toFixed(2)} gain-pts per +1 baseline-pt (r=${f.r.toFixed(2)}, n=${f.n})${f.slope < 0 ? "  ← inverse-scaling" : ""}`;

console.log(`# Inverse-Scaling Report\n`);
console.log(
	`Scanned ${data.runsScanned} runs; ${data.cellCount} graded cells.\n`,
);

console.log(`## Coverage verdict\n`);
console.log(
	`Complete cells (framework AND same-harness baseline, both graded, same target+model): **${data.rows.length}**\n`,
);
if (data.rows.length === 0)
	console.log(
		`No complete cells — a deliberate baseline-coupling run set is required.\n`,
	);
if (data.baselineOnlyGroups.length) {
	console.log(
		`Graded baselines with NO framework on the same harness/model/target:`,
	);
	for (const b of data.baselineOnlyGroups) console.log(`  - ${b}`);
	console.log();
}
if (data.orphanFrameworks.length) {
	console.log(
		`Graded frameworks with NO same-harness baseline (the gap to close):`,
	);
	for (const o of data.orphanFrameworks) console.log(`  - ${o} (no baseline)`);
	console.log();
}

if (data.rows.length) {
	console.log(`## Marginal gain table\n`);
	console.log(
		`Two absolute axes, never pooled: adherence (often ceilinged) and code quality (secondary).\n`,
	);
	console.log(
		`| target | harness | model | framework | base adh (n) | fwk adh (n) | **adh gain** | base qual | fwk qual | **qual gain** | flags |`,
	);
	console.log(`|---|---|---|---|---|---|---|---|---|---|---|`);
	for (const r of [...data.rows].sort(
		(a, b) => a.target.localeCompare(b.target) || b.adhGain - a.adhGain,
	)) {
		console.log(
			`| ${r.target} | ${r.harness} | ${r.model} | ${r.framework} | ${r.baselineAdh.toFixed(1)} (${r.nB}) | ${r.adhF.toFixed(1)} (${r.nF}) | ${fmt(r.adhGain)} | ${q(r.qualB)} | ${q(r.qualF)} | ${r.qualGain == null ? "—" : fmt(r.qualGain)} | ${r.flags.join(" ") || "—"} |`,
		);
	}
	console.log();

	console.log(`## Inverse-scaling fit (cross-target)\n`);
	console.log(
		`Within a target there's one baseline → no x-variance, so the slope is fit ACROSS targets where baseline strength varies.\n`,
	);
	console.log(
		`**Adherence axis** (x = baseline adherence, y = adherence gain):`,
	);
	console.log(`- all cells: ${sign(data.fits.adherenceAll)}`);
	console.log(`- confident only: ${sign(data.fits.adherenceConfident)}`);
	console.log(`\n**Quality axis** (x = baseline quality, y = quality gain):`);
	console.log(`- all cells: ${sign(data.fits.qualityAll)}`);
	console.log(`- confident only: ${sign(data.fits.qualityConfident)}`);
	console.log(`\n**Per-framework adherence fit** (each across its targets):`);
	for (const { framework, fit } of data.fits.perFramework)
		console.log(`- ${framework}: ${sign(fit)}`);

	console.log(
		`\nCaveats: gains measured on the eval set, not held-out (HarnessX §7.7); cross-target fit pools different PRDs on the x-axis (baseline strength) by design — the curve is the relationship, not a single-task score.`,
	);
}

#!/usr/bin/env bun
/**
 * Paired variant comparison across two brownfield runs (task 5.4): pairs trials
 * by (candidate, task) and reports how the resolution changes when only the
 * issue variant differs. Writes `variant-compare.md` beside the second run.
 *
 *   bun run scripts/compare-variants.ts runs/<runA> runs/<runB>
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RunResults, TrialResult } from "../src/types";

const [dirA, dirB] = process.argv.slice(2);
if (!dirA || !dirB)
	throw new Error("usage: bun run scripts/compare-variants.ts <runA> <runB>");

function load(dir: string): RunResults {
	const p = join(dir, "results.json");
	if (!existsSync(p)) throw new Error(`${dir}: no results.json`);
	return JSON.parse(readFileSync(p, "utf8")) as RunResults;
}

interface Pair {
	key: string;
	candidate: string;
	taskId: string;
	a: TrialResult;
	b: TrialResult;
}

function index(results: RunResults): Map<string, TrialResult> {
	const m = new Map<string, TrialResult>();
	for (const t of results.trials) {
		const b = t.provenance.brownfield;
		if (b) m.set(`${t.provenance.candidate}|${b.taskId}`, t);
	}
	return m;
}

const ra = load(dirA);
const rb = load(dirB);
const a = index(ra);
const b = index(rb);
const pairs: Pair[] = [];
for (const [key, trialB] of b) {
	const trialA = a.get(key);
	if (!trialA) continue;
	const vb = trialB.provenance.brownfield!.variant;
	const va = trialA.provenance.brownfield!.variant;
	if (va === vb) continue; // only pairs where the variant actually differs
	pairs.push({
		key,
		candidate: trialB.provenance.candidate,
		taskId: trialB.provenance.brownfield!.taskId,
		a: trialA,
		b: trialB,
	});
}

const cell = (t: TrialResult) =>
	`${t.resolution?.verdict ?? "not graded"}${t.resolution?.reason ? ` (${t.resolution.reason})` : ""}`;

const lines = [
	`# Paired variant comparison`,
	"",
	`- A: ${ra.runId} (${[...new Set(pairs.map((p) => p.a.provenance.brownfield!.variant))].join(", ") || "no pairs"})`,
	`- B: ${rb.runId} (${[...new Set(pairs.map((p) => p.b.provenance.brownfield!.variant))].join(", ")})`,
	"",
	"| Candidate | Task | A verdict | B verdict | A USD | B USD | A minutes | B minutes |",
	"| --- | --- | --- | --- | --: | --: | --: | --: |",
];
for (const p of pairs) {
	const mins = (t: TrialResult) =>
		((t.telemetry?.agentDurationMs ?? 0) / 60_000).toFixed(1);
	lines.push(
		`| ${p.candidate} | ${p.taskId} | ${cell(p.a)} | ${cell(p.b)} | $${(p.a.telemetry?.totalCostUsd ?? 0).toFixed(2)} | $${(p.b.telemetry?.totalCostUsd ?? 0).toFixed(2)} | ${mins(p.a)}m | ${mins(p.b)}m |`,
	);
}
lines.push("");
if (!pairs.length)
	lines.push("No paired trials with differing variants were found.");
const md = `${lines.join("\n")}\n`;
const out = join(dirB, "variant-compare.md");
writeFileSync(out, md);
console.log(md);
console.log(`wrote ${out}`);

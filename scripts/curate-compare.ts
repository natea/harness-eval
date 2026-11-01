/**
 * Compare curation arms against blind human labels (add-task-curation-collective 4.3, 4.4).
 *
 *   bun scripts/curate-compare.ts [--repo Future-House__paper-qa]
 *
 * Writes brownfield/<repo>/curation-report.{json,md}. Run once, after
 * curation/freeze.json is committed.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { type LeakLevel, readReviews } from "../src/brownfield/bundle";
import {
	type BundleLabels,
	bundleResamples,
	HUMAN_FAIRNESS,
	kappaDiffCI,
	roleAccuracy,
	scoreArm,
} from "../src/brownfield/curation/compare";
import { ruleHash } from "../src/brownfield/curation/quorum";
import { loadPrompt } from "../src/brownfield/curation/invoke";

const { values } = parseArgs({ options: { repo: { type: "string", default: "Future-House__paper-qa" } } });
const repoRoot = join("brownfield", values.repo as string);
const curRoot = join(repoRoot, "curation");
const freeze = JSON.parse(readFileSync(join(curRoot, "freeze.json"), "utf8"));

// Stale check: the rule and prompts must match the freeze.
const stale: string[] = [];
if (ruleHash() !== freeze.quorumRuleHash) stale.push("quorum rule");
for (const [n, h] of Object.entries(freeze.promptHashes)) if (loadPrompt(n).hash !== h) stale.push(`prompt ${n}`);
if (stale.length) throw new Error(`curation inputs changed since freeze: ${stale.join(", ")}`);

const ARMS = ["d9", "single", "controller", "collective"];
const all: BundleLabels[] = [];
const roleVotes: Record<string, { human: LeakLevel; vote: LeakLevel }[]> = {
	issue_reader: [],
	gold_comparer_round1: [],
	gold_comparer: [],
	test_auditor: [],
};
const variantHits = { body: 0, "body+human": 0, "body+all": 0, n: 0 };
const exclusions: Record<string, string[]> = { single: [], controller: [], collective: [] };
const labelers = new Set<string>();

for (const task of freeze.tasks as string[]) {
	const dir = join(repoRoot, "tasks", task);
	const reviews = readReviews(dir);
	const last = reviews.at(-1);
	if (!last) continue;
	for (const r of reviews) labelers.add(r.reviewer);
	const human = Object.fromEntries(last.items.map((i) => [i.id, i.label])) as Record<string, LeakLevel>;
	const b: BundleLabels = {
		task,
		human,
		humanFairness: HUMAN_FAIRNESS[last.fairness.verdict],
		arms: {},
	};
	const leaks = JSON.parse(readFileSync(join(dir, "leaks.json"), "utf8"));
	b.arms.d9 = {
		items: Object.fromEntries(leaks.items.map((i: { id: string; label: LeakLevel }) => [i.id, i.label])),
		fairness: "unsure",
		spendUsd: leaks.costUsd ?? 0,
		excluded: false,
	};
	for (const arm of ["single", "controller", "collective"]) {
		const f = join(curRoot, task, arm, "labels.json");
		if (!existsSync(f)) {
			exclusions[arm]?.push(`${task} (missing)`);
			continue;
		}
		const o = JSON.parse(readFileSync(f, "utf8"));
		const excluded = o.overBudget || o.failed;
		if (excluded) exclusions[arm]?.push(`${task} (${o.overBudget ? "over-budget" : "failed"})`);
		b.arms[arm] = {
			items: Object.fromEntries(o.items.map((i: { id: string; label: LeakLevel }) => [i.id, i.label])),
			fairness: o.fairness.verdict,
			spendUsd: o.spendUsd,
			excluded,
		};
	}
	// Per-role votes from the collective record.
	const rec = join(curRoot, task, "collective", "record.jsonl");
	if (existsSync(rec)) {
		const lines = readFileSync(rec, "utf8").trim().split("\n").map((l) => JSON.parse(l));
		const latest = new Map<string, LeakLevel>();
		for (const v of lines) {
			const h = human[v.item];
			if (!h) continue;
			if (v.agent === "issue_reader" && v.value?.vote) roleVotes.issue_reader?.push({ human: h, vote: v.value.vote });
			if (v.decision === "leak" && (v.agent === "gold_comparer" || v.agent === "test_auditor")) {
				latest.set(`${v.agent}|${v.item}`, v.value.label);
				if (v.agent === "gold_comparer" && v.round === 1) roleVotes.gold_comparer_round1?.push({ human: h, vote: v.value.label });
			}
		}
		for (const [k, vote] of latest) {
			const [agent, item] = k.split("|") as [string, string];
			roleVotes[agent]?.push({ human: human[item] as LeakLevel, vote });
		}
	}
	const irf = join(curRoot, task, "collective", "issue-reader.json");
	if (existsSync(irf)) {
		const ir = JSON.parse(readFileSync(irf, "utf8"));
		variantHits.n++;
		for (const v of ["body", "body+human", "body+all"] as const) if (ir.variants[v]) variantHits[v]++;
	}
	all.push(b);
}

const shared = all.filter((b) => ["single", "controller", "collective"].every((a) => b.arms[a] && !b.arms[a]?.excluded));
const draws = bundleResamples(shared.length, 2000);
const scores = ARMS.map((a) => scoreArm(shared, a, draws));
const diffs = {
	"collective - single": kappaDiffCI(shared, "collective", "single", draws),
	"collective - controller": kappaDiffCI(shared, "collective", "controller", draws),
	"controller - single": kappaDiffCI(shared, "controller", "single", draws),
};
const roles = Object.fromEntries(Object.entries(roleVotes).map(([k, v]) => [k, roleAccuracy(v)]));
const report = {
	generatedAt: new Date().toISOString(),
	freeze: { frozenAt: freeze.frozenAt, capUsd: freeze.capUsd, quorumRuleHash: freeze.quorumRuleHash },
	labelers: [...labelers],
	bundlesLabeled: all.length,
	bundlesShared: shared.length,
	exclusions,
	scores,
	kappaDiffs: diffs,
	roles,
	variantLocalization: variantHits,
};
writeFileSync(join(repoRoot, "curation-report.json"), `${JSON.stringify(report, null, 2)}\n`);

const f2 = (x: number | null) => (x == null || Number.isNaN(x) ? "—" : x.toFixed(2));
const md = [
	"# Curation pilot: single vs controller vs collective",
	"",
	`Generated ${report.generatedAt}. Inputs frozen ${freeze.frozenAt} (cap $${freeze.capUsd}/bundle = 4× single-arm median; rule hash \`${freeze.quorumRuleHash.slice(0, 12)}\`). Model ${freeze.model} for every agent.`,
	"",
	`Human labels: ${all.length} paper-qa bundles, labeler(s): ${[...labelers].join(", ")}. ${labelers.size === 1 ? "**Single labeler: no human-to-human agreement ceiling is available.**" : ""}`,
	`Shared comparison: ${shared.length} bundles where every arm stayed within the cap. Bootstrap CIs resample bundles (B=2000).`,
	"",
	"| Arm | Items | Accuracy [95% CI] | κ [95% CI] | weighted κ | within ±1 | Fairness agree | Mean $/bundle | Acc per $ |",
	"|---|---|---|---|---|---|---|---|---|",
	...scores.map(
		(s) =>
			`| ${s.arm} | ${s.items}${s.unlabeled ? ` (+${s.unlabeled} unlabeled)` : ""} | ${f2(s.accuracy)} [${f2(s.ci.accuracy[0])}, ${f2(s.ci.accuracy[1])}] | ${f2(s.kappa)} [${f2(s.ci.kappa[0])}, ${f2(s.ci.kappa[1])}] | ${f2(s.weightedKappa)} | ${f2(s.withinOne)} | ${s.arm === "d9" ? "—" : f2(s.fairnessAgreement)} | ${s.meanSpendUsd.toFixed(3)} | ${s.accuracyPerDollar ? s.accuracyPerDollar.toFixed(1) : "—"} |`,
	),
	"",
	"`d9` is the existing `leaks.json` classifier output (leak levels only), shown for reference.",
	"",
	"## κ differences (same bundle resamples)",
	"",
	"| Contrast | Δκ | 95% CI |",
	"|---|---|---|",
	...Object.entries(diffs).map(([k, [p, lo, hi]]) => `| ${k} | ${f2(p)} | [${f2(lo)}, ${f2(hi)}] |`),
	"",
	"## Per-role vote accuracy (collective arm, vs human)",
	"",
	"| Role | Votes | Accuracy | Higher than human | Lower than human |",
	"|---|---|---|---|---|",
	...Object.entries(roles).map(([k, r]) => `| ${k} | ${r.n} | ${f2(r.accuracy)} | ${r.higher} | ${r.lower} |`),
	"",
	"## Exclusions",
	"",
	...Object.entries(exclusions).map(([k, v]) => `- ${k}: ${v.length}${v.length ? ` (${v.join(", ")})` : ""}`),
	"",
	"## Blind localization by prompt variant (issue reader, by-product)",
	"",
	`Of ${variantHits.n} bundles, the issue reader named every reference file from: body ${variantHits.body}, body+human ${variantHits["body+human"]}, body+all ${variantHits["body+all"]}.`,
	"",
	"## Caveats",
	"",
	`- Pilot power: ${shared.length} bundles; only κ differences of roughly 0.25 or more are likely detectable.`,
	"- One model for every agent: the comparison varies evidence and organization, not models.",
	"- Outputs live outside the bundle dirs (not yet frozen into bundle hashes; task 2.5).",
	"",
].join("\n");
writeFileSync(join(repoRoot, "curation-report.md"), md);
console.log(md);

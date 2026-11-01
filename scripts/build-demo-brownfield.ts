#!/usr/bin/env bun
/**
 * Bakes the brownfield trials into pages/demo/data/brownfield.json for the
 * static demo. Read-only over runs/. Leaves out transcripts, local paths and
 * reviewer names. Run: bun scripts/build-demo-brownfield.ts
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { agreementSummary } from "../src/brownfield/review";
import { withCorrectedCosts } from "../src/driver/telemetry";
import { brownfieldRunRows, brownfieldTrialArtifacts } from "../src/dashboard/brownfield";

const RUNS = "runs";
const OUT = "pages/demo/data/brownfield.json";
/** Archived judge notes can predate the "original PR" wording. */
const reword = (s: string) =>
	s
		.replace(/\bPR human\b/gi, "original PR")
		.replace(/\bhuman PR\b/gi, "original PR")
		.replace(/\bhuman\b/gi, "original");

const runs: unknown[] = [];
for (const id of readdirSync(RUNS).sort()) {
	const file = join(RUNS, id, "results.json");
	if (!existsSync(file)) continue;
	let results: any;
	try {
		results = JSON.parse(readFileSync(file, "utf8"));
	} catch {
		continue;
	}
	// Same cost correction the dashboard applies; archived figures double-count resumed sessions.
	const bf = (results.trials ?? [])
		.filter((t: any) => t.provenance?.brownfield)
		.map(withCorrectedCosts);
	if (!bf.length) continue;
	const dir = join(RUNS, id);
	const rows = brownfieldRunRows(dir, bf);
	runs.push({
		id,
		startedAt: results.startedAt,
		model: String(bf[0].provenance.model).replace(/-key$/, ""),
		trials: rows.map((r: any, i: number) => {
			const a: any = brownfieldTrialArtifacts(dir, bf[i]);
			const q = a?.quality;
			return {
				id: r.trialId,
				candidate: r.candidate,
				version: bf[i].provenance.candidateVersion ?? null,
				status: r.status,
				variant: r.variant,
				task: r.task && {
					repo: r.task.repo, id: r.task.taskId, title: r.task.title,
					pr: r.task.pr, prUrl: r.task.prUrl, issues: r.task.issues, issueUrls: r.task.issueUrls,
				},
				verdict: r.verdict,
				reason: r.reason,
				testFilesEdited: r.testInfraModified,
				audit: r.audit,
				engaged: r.activity?.engaged ?? null,
				activitySummary: r.activity?.summary ?? null,
				minutes: r.minutes,
				costUsd: r.costUsd,
				flags: r.flags,
				quality: q && {
					judgeModel: q.judgeModel,
					harness: q.harnessScore,
					original: q.humanScore,
					preference: q.preference === "human" ? "original" : q.preference,
					votes: { harness: q.votes.harness, original: q.votes.human, tie: q.votes.tie },
					criteria: q.criteria.map((c: any) => ({
						label: c.label, harness: c.harness, original: c.human, note: reword(c.notes?.[0] ?? ""),
					})),
				},
				signals: r.status !== "infra-failed" && r.signals && {
					harnessLines: r.signals.candidateLines, originalLines: r.signals.humanLines, f1: r.signals.f1,
				},
				failToPass: a?.grade?.failToPass ?? null,
				candidatePatch: a?.candidatePatch ?? null,
				referencePatch: a?.referencePatch ?? null,
			};
		}),
	});
}

const ag: any = agreementSummary();
writeFileSync(OUT, JSON.stringify({
	generatedAt: new Date().toISOString(),
	agreement: {
		reviewedTasks: ag.reviewedTasks,
		n: ag.leak.n,
		observed: ag.leak.observed,
		kappa: ag.leak.kappa,
		weightedKappa: ag.leak.weightedKappa,
		confusion: ag.leak.confusion,
		fairness: ag.fairness,
	},
	runs,
}));
console.log(`wrote ${OUT}: ${runs.length} runs, ${(runs as any[]).reduce((n, r) => n + r.trials.length, 0)} trials`);

/**
 * Read-only brownfield artifacts for the dashboard (results-dashboard: brownfield
 * run/trial views, transcript view). Everything comes from the run directory and
 * the frozen task bundle; nothing is written.
 */

import { activitySummary, trialActivity } from "../brownfield/activity";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	bundleDir,
	loadBundle,
	readSnapshot,
	readText,
} from "../brownfield/bundle";

const readJson = (p: string) =>
	existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
const readStr = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : null);

export interface TaskMeta {
	repo: string;
	taskId: string;
	title: string;
	pr: number;
	issues: number[];
	prUrl: string;
	issueUrls: string[];
	humanMinutes: number | null;
	humanReviewRounds: number | null;
	leakBody: string | null;
}

export function taskMeta(repoDir: string, taskId: string): TaskMeta | null {
	try {
		const b = loadBundle(bundleDir(repoDir, taskId));
		const m = b.manifest as Record<string, any>;
		const snap = readSnapshot(b.dir);
		const h = m.humanBaseline;
		return {
			repo: m.repo,
			taskId,
			title: snap.title,
			pr: m.pr,
			issues: m.issues,
			prUrl: `https://github.com/${m.repo}/pull/${m.pr}`,
			issueUrls: (m.issues as number[]).map(
				(i) => `https://github.com/${m.repo}/issues/${i}`,
			),
			humanMinutes: h ? h.codingWindowMinutes + h.reviewMinutes : null,
			humanReviewRounds: h ? h.reviewRounds : null,
			leakBody: m.leak?.body ?? null,
		};
	} catch {
		return null;
	}
}

function activityOf(trialDir: string, provenance: any) {
	const a = trialActivity(
		trialDir,
		(provenance.sessionScript ?? []).map((s: { prompt: string }) => s.prompt),
	);
	return a ? { ...a, summary: activitySummary(a) } : null;
}

/** Per-trial summary rows for a brownfield run view. */
export function brownfieldRunRows(
	runDir: string,
	trials: { provenance: any; telemetry: any; resolution?: any }[],
) {
	return trials
		.filter((t) => t.provenance.brownfield)
		.map((t) => {
			const b = t.provenance.brownfield;
			const dir = join(runDir, "trials", t.provenance.trialId);
			const q = readJson(join(dir, "quality.json"));
			const s = readJson(join(dir, "signals.json"));
			const g = readJson(join(dir, "grade.json"));
			const a = readJson(join(dir, "audit.json"));
			return {
				trialId: t.provenance.trialId,
				candidate: t.provenance.candidate,
				status: t.provenance.status,
				variant: b.variant,
				task: taskMeta(b.repoDir, b.taskId),
				verdict: t.resolution?.verdict ?? g?.verdict ?? null,
				reason: t.resolution?.reason ?? g?.reason ?? null,
				testInfraModified: g?.testInfraModified ?? [],
				audit: a?.verdict ?? null,
				quality: q
					? {
							harness: q.harnessScore,
							human: q.humanScore,
							preference: q.preference,
							votes: q.votes,
						}
					: null,
				signals: s
					? {
							candidateLines: s.candidate.additions + s.candidate.deletions,
							humanLines: s.reference.additions + s.reference.deletions,
							f1: s.localization.f1,
						}
					: null,
				activity: activityOf(dir, t.provenance),
				minutes: t.telemetry ? t.telemetry.agentDurationMs / 60000 : null,
				costUsd: t.telemetry?.totalCostUsd ?? null,
				flags: t.provenance.flags ?? [],
			};
		});
}

/** Everything a brownfield trial view needs. */
export function brownfieldTrialArtifacts(
	runDir: string,
	trial: { provenance: any },
) {
	const b = trial.provenance.brownfield;
	if (!b) return null;
	const dir = join(runDir, "trials", trial.provenance.trialId);
	let referencePatch: string | null = null;
	let testsPatch: string | null = null;
	try {
		const bdir = bundleDir(b.repoDir, b.taskId);
		referencePatch = readText(bdir, "reference.patch");
		testsPatch = readText(bdir, "tests.patch");
	} catch {}
	return {
		task: taskMeta(b.repoDir, b.taskId),
		candidatePatch: readStr(join(dir, "candidate.patch")),
		referencePatch,
		testsPatch,
		grade: readJson(join(dir, "grade.json")),
		judge: readJson(join(dir, "judge.json")),
		signals: readJson(join(dir, "signals.json")),
		audit: readJson(join(dir, "audit.json")),
		quality: readJson(join(dir, "quality.json")),
		activity: activityOf(dir, trial.provenance),
	};
}

/** The trial's rendered conversation (redacted at archive time), if any. */
export function trialTranscript(
	runDir: string,
	trialId: string,
): string | null {
	const dir = join(runDir, "trials", trialId, "transcripts");
	const conv = readStr(join(dir, "conversation.md"));
	if (conv) return conv;
	if (!existsSync(dir)) return null;
	const parts = readdirSync(dir)
		.filter((f) => /^session-\d+\.md$/.test(f))
		.sort()
		.map((f) => readFileSync(join(dir, f), "utf8"));
	return parts.length ? parts.join("\n\n---\n\n") : null;
}

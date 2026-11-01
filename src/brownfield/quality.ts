/**
 * Brownfield code-quality comparison (task 5.2): the harness's PR vs the original
 * PR that was actually merged for the same issue, scored on one rubric.
 *
 * Blind and position-balanced: the judge sees two diffs labelled A and B and is
 * never told which is which. The original side is the merged PR as submitted
 * (reference.patch + tests.patch), so both sides include their tests. Samples
 * alternate which side is A, so a position bias cancels instead of favouring
 * one side; per-criterion scores are medians over samples (same method as the
 * greenfield quality judge). Judge ≠ worker is enforced by the caller.
 */

import { anthropicApiJudgeRunner, type JudgeRunner } from "./judge";

export const QUALITY_CRITERIA = [
	{
		id: "correctness",
		label: "Correctness",
		ask: "Does it fix the reported behaviour without introducing evident bugs or regressions?",
	},
	{
		id: "scope",
		label: "Scope",
		ask: "Is the change focused on the issue, without unrelated edits, churn or over-engineering?",
	},
	{
		id: "clarity",
		label: "Clarity",
		ask: "Is the code readable, idiomatic and well named, with comments only where they help?",
	},
	{
		id: "consistency",
		label: "Codebase fit",
		ask: "Does it follow the surrounding code's conventions, APIs and structure?",
	},
	{
		id: "robustness",
		label: "Robustness",
		ask: "Does it handle edge cases and failure modes sensibly?",
	},
	{
		id: "tests",
		label: "Tests",
		ask: "Does it add or update tests that meaningfully cover the change?",
	},
] as const;
export type CriterionId = (typeof QUALITY_CRITERIA)[number]["id"];

export const QUALITY_SYSTEM =
	"You are a strict senior engineer reviewing two pull requests that each try to resolve the same issue in the same repository. Score each PR independently on every criterion from 0 (very poor) to 10 (excellent). Judge the code, not its length; a shorter diff is not better unless it is also correct and complete. Do not try to guess which PR was written by whom.";

const scoreProps = Object.fromEntries(
	QUALITY_CRITERIA.map((c) => [
		c.id,
		{ type: "integer", minimum: 0, maximum: 10 },
	]),
);
const ids = QUALITY_CRITERIA.map((c) => c.id);

export const QUALITY_SCHEMA = {
	type: "object",
	properties: {
		a: {
			type: "object",
			properties: scoreProps,
			required: ids,
			additionalProperties: false,
		},
		b: {
			type: "object",
			properties: scoreProps,
			required: ids,
			additionalProperties: false,
		},
		notes: {
			type: "object",
			description: "One short sentence per criterion comparing A and B.",
			properties: Object.fromEntries(ids.map((id) => [id, { type: "string" }])),
			required: ids,
			additionalProperties: false,
		},
		preference: { type: "string", enum: ["A", "B", "tie"] },
		rationale: { type: "string" },
	},
	required: ["a", "b", "notes", "preference", "rationale"],
	additionalProperties: false,
} as const;

export interface QualityInput {
	issueTitle: string;
	issueBody: string;
	/** The harness's patch. */
	candidatePatch: string;
	/** The original (merged) PR: reference.patch + tests.patch. */
	humanPatch: string;
}

export interface QualityCriterion {
	criterion: CriterionId;
	label: string;
	harness: number;
	human: number;
	harnessSamples: number[];
	humanSamples: number[];
	notes: string[];
}

export interface QualityComparison {
	judgeModel: string;
	samples: number;
	criteria: QualityCriterion[];
	/** Mean of per-criterion medians × 10 (0–100), as the greenfield quality score. */
	harnessScore: number;
	humanScore: number;
	preference: "harness" | "human" | "tie";
	votes: { harness: number; human: number; tie: number };
	rationales: string[];
	costUsd: number;
}

const MAX_PATCH = 14_000;
const clip = (s: string, n: number) =>
	s.length > n ? `${s.slice(0, n)}\n… (${s.length - n} chars truncated)` : s;

export function buildQualityPrompt(
	issue: { title: string; body: string },
	a: string,
	b: string,
): string {
	const rubric = QUALITY_CRITERIA.map(
		(c) => `- **${c.id}** (${c.label}): ${c.ask}`,
	).join("\n");
	return [
		`## Issue\n\n${issue.title}\n\n${clip(issue.body, 6_000)}`,
		`## Rubric (score each PR 0–10 on every criterion)\n\n${rubric}`,
		`## PR A\n\n\`\`\`diff\n${clip(a || "(empty diff)", MAX_PATCH)}\n\`\`\``,
		`## PR B\n\n\`\`\`diff\n${clip(b || "(empty diff)", MAX_PATCH)}\n\`\`\``,
	].join("\n\n");
}

const median = (xs: number[]) => {
	const s = [...xs].sort((x, y) => x - y);
	const m = Math.floor(s.length / 2);
	return s.length % 2
		? (s[m] as number)
		: ((s[m - 1] as number) + (s[m] as number)) / 2;
};

export async function compareQuality(
	input: QualityInput,
	opts: {
		model: string;
		env?: Record<string, string>;
		samples?: number;
		runner?: JudgeRunner;
	},
): Promise<QualityComparison> {
	const runner = opts.runner ?? anthropicApiJudgeRunner;
	const n = Math.max(1, opts.samples ?? 3);
	const per = new Map<
		CriterionId,
		{ h: number[]; u: number[]; notes: string[] }
	>(ids.map((id) => [id, { h: [], u: [], notes: [] }]));
	const votes = { harness: 0, human: 0, tie: 0 };
	const rationales: string[] = [];
	let costUsd = 0;
	for (let i = 0; i < n; i++) {
		// Alternate sides: even samples put the harness in A, odd in B.
		const harnessIsA = i % 2 === 0;
		const [a, b] = harnessIsA
			? [input.candidatePatch, input.humanPatch]
			: [input.humanPatch, input.candidatePatch];
		const { structured, costUsd: c } = await runner({
			model: opts.model,
			env: opts.env,
			system: QUALITY_SYSTEM,
			prompt: buildQualityPrompt(
				{ title: input.issueTitle, body: input.issueBody },
				a,
				b,
			),
			schema: QUALITY_SCHEMA,
		});
		costUsd += c;
		const sa = structured.a as Record<string, number>;
		const sb = structured.b as Record<string, number>;
		const notes = (structured.notes ?? {}) as Record<string, string>;
		for (const id of ids) {
			const slot = per.get(id);
			if (!slot) continue;
			const [h, u] = harnessIsA ? [sa[id], sb[id]] : [sb[id], sa[id]];
			if (typeof h !== "number" || typeof u !== "number")
				throw new Error(`quality judge omitted '${id}'`);
			slot.h.push(h);
			slot.u.push(u);
			// Notes speak of A/B; translate so readers see who is who.
			if (notes[id])
				slot.notes.push(
					notes[id]
						.replace(/\bA\b/g, harnessIsA ? "harness" : "original PR")
						.replace(/\bB\b/g, harnessIsA ? "original PR" : "harness"),
				);
		}
		const pref = String(structured.preference);
		if (pref === "tie") votes.tie++;
		else if ((pref === "A") === harnessIsA) votes.harness++;
		else votes.human++;
		rationales.push(
			String(structured.rationale ?? "")
				.replace(/\bPR A\b|\bA\b/g, harnessIsA ? "harness PR" : "original PR")
				.replace(/\bPR B\b|\bB\b/g, harnessIsA ? "original PR" : "harness PR"),
		);
	}
	const criteria: QualityCriterion[] = QUALITY_CRITERIA.map((c) => {
		const slot = per.get(c.id) as { h: number[]; u: number[]; notes: string[] };
		return {
			criterion: c.id,
			label: c.label,
			harness: median(slot.h),
			human: median(slot.u),
			harnessSamples: slot.h,
			humanSamples: slot.u,
			notes: slot.notes,
		};
	});
	const score = (k: "harness" | "human") =>
		Math.round((criteria.reduce((s, c) => s + c[k], 0) / criteria.length) * 10);
	const preference =
		votes.harness > votes.human && votes.harness > votes.tie
			? "harness"
			: votes.human > votes.harness && votes.human > votes.tie
				? "human"
				: "tie";
	return {
		judgeModel: opts.model,
		samples: n,
		criteria,
		harnessScore: score("harness"),
		humanScore: score("human"),
		preference,
		votes,
		rationales,
		costUsd,
	};
}

/* ---------------------------------------------------------------- run-level */

export const QUALITY_FILE = "quality.json";

export interface RunQualityOptions {
	runDir: string;
	/** Model id passed to the judge CLI. */
	model: string;
	/** Worker model id(s) of the run; the judge must differ. */
	workerModels: string[];
	samples?: number;
	force?: boolean;
	runner?: JudgeRunner;
	log?: (m: string) => void;
}

/**
 * Compare every scored brownfield trial's patch with its task's merged PR and
 * write trials/<id>/quality.json. Skips trials without a patch, disqualified
 * trials, and (unless `force`) trials already compared.
 */
export async function compareRunQuality(
	opts: RunQualityOptions,
): Promise<{ compared: number; skipped: number; costUsd: number }> {
	const { existsSync, readFileSync, writeFileSync } = await import("node:fs");
	const { join } = await import("node:path");
	const { bundleDir, readSnapshot, readText } = await import("./bundle");
	const { assertClassifierIndependent } = await import("./classify");
	for (const w of opts.workerModels) assertClassifierIndependent(opts.model, w);
	const log = opts.log ?? (() => {});
	const results = JSON.parse(
		readFileSync(join(opts.runDir, "results.json"), "utf8"),
	) as {
		trials: {
			provenance: {
				trialId: string;
				candidate: string;
				status: string;
				brownfield?: { repoDir: string; taskId: string };
			};
			resolution?: { reason?: string | null } | null;
		}[];
	};
	let compared = 0;
	let skipped = 0;
	let costUsd = 0;
	for (const t of results.trials) {
		const ref = t.provenance.brownfield;
		if (!ref) continue;
		const trialDir = join(opts.runDir, "trials", t.provenance.trialId);
		const patchPath = join(trialDir, "candidate.patch");
		const out = join(trialDir, QUALITY_FILE);
		if (
			t.provenance.status === "infra-failed" ||
			t.resolution?.reason === "solution-reach" ||
			!existsSync(patchPath) ||
			(existsSync(out) && !opts.force)
		) {
			skipped++;
			continue;
		}
		const dir = bundleDir(ref.repoDir, ref.taskId);
		const snapshot = readSnapshot(dir);
		const humanPatch = [
			readText(dir, "reference.patch"),
			readText(dir, "tests.patch"),
		]
			.filter(Boolean)
			.join("\n");
		const q = await compareQuality(
			{
				issueTitle: snapshot.title,
				issueBody: snapshot.body,
				candidatePatch: readFileSync(patchPath, "utf8"),
				humanPatch,
			},
			{ model: opts.model, samples: opts.samples, runner: opts.runner },
		);
		writeFileSync(out, `${JSON.stringify(q, null, 2)}\n`);
		compared++;
		costUsd += q.costUsd;
		log(
			`quality ${t.provenance.candidate} ${ref.taskId}: harness ${q.harnessScore} vs human ${q.humanScore} → prefers ${q.preference} (${q.votes.harness}/${q.votes.human}/${q.votes.tie}), $${q.costUsd.toFixed(3)}`,
		);
	}
	return { compared, skipped, costUsd };
}

/**
 * Display wording: the comparison is harness PR vs the original PR (not human vs
 * machine). Older quality.json files stored "human"; reword them when shown,
 * without rewriting archived trial artifacts.
 */
export function originalPrWording(text: string): string {
	return text
		.replace(/\bmerged human PR\b/gi, "original PR")
		.replace(/\bhuman PR's\b/gi, "original PR's")
		.replace(/\bhuman PR\b/gi, "original PR")
		.replace(/\bhuman's\b/gi, "original PR's")
		.replace(/\bhuman\b/gi, "original PR");
}

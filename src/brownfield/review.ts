/**
 * Read model + the one write for the Studio task review page (design D15).
 *
 * Blind labeling is enforced HERE, server-side, not just in the UI: nothing
 * derived from the LLM classifier (labels, evidence, rationale, or the manifest's
 * leak strata) leaves this module for a task until that task has at least one
 * human review. The only write is `submitReview`, which appends one line to the
 * bundle's review/labels.jsonl (see `appendReview`).
 */
import { type Agreement, agreement, type Pair } from "./agreement";
import {
	appendReview,
	BROWNFIELD_ROOT,
	type Bundle,
	BundleError,
	bundleDir,
	ISSUE_VARIANTS,
	type IssueVariant,
	itemIds,
	type LeakLabels,
	type LeakLevel,
	listBundleDirs,
	loadBundle,
	type ReviewRecord,
	readLeaks,
	readReviews,
	readSnapshot,
	readText,
	type Snapshot,
} from "./bundle";

export interface TaskSummary {
	repoDir: string;
	id: string;
	repo: string;
	pr: number;
	issues: number[];
	verdict: string;
	provisional: boolean;
	items: number;
	reviews: number;
	/** LLM leak strata — present only once the task has been reviewed (blind). */
	leak: { body: LeakLevel | null; comments: LeakLevel | null } | null;
	error?: string;
}

export interface ItemAgreement {
	id: string;
	human: LeakLevel;
	llm: LeakLevel | null;
	agree: boolean;
}

export interface TaskDetail {
	repoDir: string;
	id: string;
	repo: string;
	pr: number;
	issues: number[];
	verdict: string;
	provisional: boolean;
	tStar: string;
	failToPass: string[];
	envBroken: string[];
	depsTouched: boolean;
	snapshot: Snapshot;
	itemIds: string[];
	variants: Record<IssueVariant, string | null>;
	referencePatch: string;
	testsPatch: string;
	validation: unknown;
	reviews: ReviewRecord[];
	/** Withheld (null) until the task has a human review. */
	llm: LeakLabels | null;
	agreement: ItemAgreement[] | null;
	/** Human-vs-human κ over every pair of this task's reviews (null below two). */
	interHuman: Agreement | null;
}

function summarize(b: Bundle): TaskSummary {
	const reviews = readReviews(b.dir);
	const snap = readSnapshot(b.dir);
	const m = b.manifest;
	return {
		repoDir: b.repoDir,
		id: b.id,
		repo: m.repo,
		pr: m.pr,
		issues: m.issues,
		verdict: m.verdict,
		provisional: m.provisional,
		items: itemIds(snap).length,
		reviews: reviews.length,
		leak: reviews.length ? m.leak : null,
	};
}

export function listTasks(root = BROWNFIELD_ROOT): TaskSummary[] {
	return listBundleDirs(root).map((dir) => {
		try {
			return summarize(loadBundle(dir));
		} catch (e) {
			const parts = dir.split(/[\\/]/);
			return {
				repoDir: parts.at(-3) ?? "",
				id: parts.at(-1) ?? "",
				repo: "",
				pr: 0,
				issues: [],
				verdict: "error",
				provisional: false,
				items: 0,
				reviews: 0,
				leak: null,
				error: (e as Error).message,
			};
		}
	});
}

/** Label pairs from every pair of reviews on the same items (human vs human). */
function interHumanPairs(reviews: ReviewRecord[]): Pair[] {
	const pairs: Pair[] = [];
	for (let i = 0; i < reviews.length; i++) {
		for (let j = i + 1; j < reviews.length; j++) {
			const a = reviews[i];
			const b = reviews[j];
			if (!a || !b) continue;
			const byId = new Map(b.items.map((it) => [it.id, it.label]));
			for (const it of a.items) {
				const other = byId.get(it.id);
				if (other) pairs.push([it.label, other]);
			}
		}
	}
	return pairs;
}

function itemAgreement(review: ReviewRecord, llm: LeakLabels): ItemAgreement[] {
	const byId = new Map(llm.items.map((i) => [i.id, i.label]));
	return review.items.map((i) => {
		const l = byId.get(i.id) ?? null;
		return { id: i.id, human: i.label, llm: l, agree: l === i.label };
	});
}

export function getTask(
	repoDir: string,
	id: string,
	root = BROWNFIELD_ROOT,
): TaskDetail {
	const b = loadBundle(bundleDir(repoDir, id, root));
	const snap = readSnapshot(b.dir);
	const reviews = readReviews(b.dir);
	const reviewed = reviews.length > 0;
	const llm = reviewed ? readLeaks(b.dir) : null;
	const latest = reviews.at(-1);
	const m = b.manifest;
	return {
		repoDir: b.repoDir,
		id: b.id,
		repo: m.repo,
		pr: m.pr,
		issues: m.issues,
		verdict: m.verdict,
		provisional: m.provisional,
		tStar: m.tStar,
		failToPass: m.failToPass,
		envBroken: m.envBroken,
		depsTouched: m.depsTouched,
		snapshot: snap,
		itemIds: itemIds(snap),
		variants: Object.fromEntries(
			ISSUE_VARIANTS.map((v) => [v, readText(b.dir, `issue/${v}.md`)]),
		) as Record<IssueVariant, string | null>,
		referencePatch: readText(b.dir, "reference.patch") ?? "",
		testsPatch: readText(b.dir, "tests.patch") ?? "",
		validation: JSON.parse(readText(b.dir, "validation.json") ?? "null"),
		reviews,
		llm,
		agreement: latest && llm ? itemAgreement(latest, llm) : null,
		interHuman: reviews.length > 1 ? agreement(interHumanPairs(reviews)) : null,
	};
}

/** The single write: append one review, then return the (now unblinded) detail. */
export function submitReview(
	repoDir: string,
	id: string,
	record: unknown,
	root = BROWNFIELD_ROOT,
): TaskDetail {
	const dir = bundleDir(repoDir, id, root);
	loadBundle(dir); // refuse to append to a bundle that fails its hash check
	appendReview(dir, record);
	return getTask(repoDir, id, root);
}

export interface Disagreement {
	repoDir: string;
	id: string;
	item: string;
	human: LeakLevel;
	llm: LeakLevel;
}

export interface AgreementSummary {
	/** Human-vs-human κ pooled across all review pairs; null with <2 reviews. */
	interHuman: Agreement | null;
	reviewedTasks: number;
	totalTasks: number;
	leak: Agreement;
	fairness: Record<"yes" | "no" | "unsure", number>;
	disagreements: Disagreement[];
}

/** Agreement across all reviewed tasks, using each task's latest review. */
export function agreementSummary(root = BROWNFIELD_ROOT): AgreementSummary {
	const pairs: Pair[] = [];
	const disagreements: Disagreement[] = [];
	const fairness = { yes: 0, no: 0, unsure: 0 };
	let reviewedTasks = 0;
	const humanPairs: Pair[] = [];
	const dirs = listBundleDirs(root);
	for (const dir of dirs) {
		let b: Bundle;
		try {
			b = loadBundle(dir);
		} catch (e) {
			if (e instanceof BundleError) continue;
			throw e;
		}
		const reviews = readReviews(b.dir);
		humanPairs.push(...interHumanPairs(reviews));
		const latest = reviews.at(-1);
		const llm = readLeaks(b.dir);
		if (!latest || !llm) continue;
		reviewedTasks++;
		fairness[latest.fairness.verdict]++;
		for (const a of itemAgreement(latest, llm)) {
			if (!a.llm) continue;
			pairs.push([a.human, a.llm]);
			if (!a.agree)
				disagreements.push({
					repoDir: b.repoDir,
					id: b.id,
					item: a.id,
					human: a.human,
					llm: a.llm,
				});
		}
	}
	return {
		reviewedTasks,
		totalTasks: dirs.length,
		leak: agreement(pairs),
		interHuman: humanPairs.length ? agreement(humanPairs) : null,
		fairness,
		disagreements,
	};
}

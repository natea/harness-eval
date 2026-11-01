/**
 * Collective quorum rule (add-task-curation-collective D4, D6).
 *
 * Pure code, no model calls. The SHA-256 of this file's source is the rule hash
 * recorded in every collective output and in the pilot freeze file, so a changed
 * rule makes earlier outputs detectably stale.
 */
import { readFileSync } from "node:fs";
import { LEAK_LEVELS, type LeakLevel, sha256 } from "../bundle";

/** A role's vote on one item; `null` is an abstention. */
export type Vote = LeakLevel | null;

const rank = (l: LeakLevel) => LEAK_LEVELS.indexOf(l);

/**
 * D4: the issue reader's per-item votes from cumulative-prefix localization.
 * `localizes[k]` is whether prefix k (0 = body, k = body+c1..ck) localized.
 * First localizing prefix → `diagnosis`; not localized → `symptom`; after an
 * earlier prefix already localized → abstain.
 */
export function issueReaderVotes(localizes: boolean[]): Vote[] {
	let seen = false;
	return localizes.map((loc) => {
		if (seen) return null;
		if (loc) {
			seen = true;
			return "diagnosis";
		}
		return "symptom";
	});
}

/** A prefix localizes when its predictions cover every non-test reference file. */
export function localizes(predicted: string[], referenceFiles: string[]): boolean {
	if (referenceFiles.length === 0) return false;
	const p = new Set(predicted.map((f) => f.replace(/^\.?\//, "")));
	return referenceFiles.every((f) => p.has(f));
}

export interface ItemVotes {
	/** The gold comparer's latest verdict; absent when its call failed. */
	gold?: { label: LeakLevel; consistent: boolean } | null;
	issueReader?: Vote;
	testAuditor?: Vote;
}

/**
 * D6 leak-level quorum: median of the non-abstaining votes; with an even count,
 * the higher of the two middle levels; then the gold cap (inconsistent with the
 * reference → at most `symptom`). No gold vote → `unlabeled`.
 */
export function leakQuorum(v: ItemVotes): LeakLevel | "unlabeled" {
	if (!v.gold) return "unlabeled";
	const votes = [v.gold.label, v.issueReader, v.testAuditor]
		.filter((x): x is LeakLevel => x != null)
		.map(rank)
		.sort((a, b) => a - b);
	const n = votes.length;
	let out =
		n % 2 === 1
			? (votes[(n - 1) / 2] as number)
			: Math.max(votes[n / 2 - 1] as number, votes[n / 2] as number);
	if (!v.gold.consistent) out = Math.min(out, rank("symptom"));
	return LEAK_LEVELS[out] as LeakLevel;
}

export type Fairness = "fair" | "unfair" | "unsure";

/** D6 fairness: `fair` needs both; `unfair` if either says so; else `unsure`. */
export function fairnessQuorum(
	testAuditor: Fairness | null | undefined,
	gold: Fairness | null | undefined,
): Fairness {
	if (testAuditor === "fair" && gold === "fair") return "fair";
	if (testAuditor === "unfair" || gold === "unfair") return "unfair";
	return "unsure";
}

export type Difficulty = "easy" | "medium" | "hard";

/** D6 difficulty rule, declared before the pilot. */
export function difficultyRule(x: {
	/** Non-test lines added + removed in the reference patch. */
	refLines: number;
	bodyLocalizes: boolean;
	similarPriorFix: boolean;
}): Difficulty {
	if (x.refLines <= 20 && (x.bodyLocalizes || x.similarPriorFix)) return "easy";
	if (x.refLines > 100 || (!x.bodyLocalizes && !x.similarPriorFix && x.refLines > 40))
		return "hard";
	return "medium";
}

/** SHA-256 of this file's source: the recorded quorum-rule hash. */
export function ruleHash(): string {
	return sha256(readFileSync(new URL(import.meta.url).pathname));
}

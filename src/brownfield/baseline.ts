/**
 * Original PR baseline timings (design D16). Computed from data the miner already
 * fetches. Reports show these beside agent time; they never convert original PR time to
 * cost or claim counterfactual merge-time savings.
 */
import type { GhPullRequest } from "./github";
import { isTestPath } from "./paths";

export interface HumanBaseline {
	/** T* → last PR commit before the first submitted review (or before merge). Upper bound. */
	codingWindowMinutes: number;
	/** PR created → merged. */
	reviewMinutes: number;
	reviewRounds: number;
	commitsAfterFirstReview: number;
	/** Issue created → merged (context only). */
	issueLifetimeMinutes: number;
	humanDiff: { linesAdded: number; linesRemoved: number; filesTouched: number };
}

const minutes = (from: string, to: string) =>
	Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 60000));

export function computeHumanBaseline(
	pr: GhPullRequest,
	tStar: string,
	issueCreatedAt: string,
): HumanBaseline {
	const commitTimes = pr.commits.nodes
		.map((n) => n.commit.committedDate)
		.sort();
	const submitted = (pr.reviews?.nodes ?? [])
		.filter((r) => r.submittedAt && r.state !== "PENDING")
		.map((r) => r.submittedAt as string)
		.sort();
	const firstReview = submitted[0];
	const end = firstReview ?? pr.mergedAt;
	const beforeEnd = commitTimes.filter((t) => t <= end);
	const windowEnd = beforeEnd.at(-1) ?? tStar;
	const src = (pr.files?.nodes ?? []).filter((f) => !isTestPath(f.path));
	return {
		codingWindowMinutes: minutes(tStar, windowEnd),
		reviewMinutes: minutes(pr.createdAt, pr.mergedAt),
		reviewRounds: submitted.length,
		commitsAfterFirstReview: firstReview
			? commitTimes.filter((t) => t > firstReview).length
			: 0,
		issueLifetimeMinutes: minutes(issueCreatedAt, pr.mergedAt),
		humanDiff: {
			linesAdded: src.reduce((s, f) => s + f.additions, 0),
			linesRemoved: src.reduce((s, f) => s + f.deletions, 0),
			filesTouched: src.length,
		},
	};
}

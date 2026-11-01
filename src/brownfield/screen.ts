/**
 * Candidate screening (design D5, task 1.2): which PR ↔ issue pairs are worth
 * snapshotting and validating. Rejections are recorded with a reason, never
 * silently dropped.
 */
import { isDependencyPath, isSourceCodePath, isTestPath } from "./paths";

export type ScreenReason =
	| "cross-repo-issue"
	| "no-src-code-change"
	| "no-test-change";

export interface ScreenInput {
	repo: string;
	pr: number;
	files: string[];
	/** Closing issues with the repo each lives in. */
	issues: { number: number; repo: string }[];
}

export interface ScreenResult {
	pr: number;
	/** Same-repo issues to build tasks for (empty when rejected). */
	issues: number[];
	rejected: { reason: ScreenReason; issue?: number }[];
	srcFiles: string[];
	testFiles: string[];
	depsTouched: boolean;
}

export function screenPr(input: ScreenInput): ScreenResult {
	const testFiles = input.files.filter(isTestPath);
	const srcFiles = input.files.filter((f) => !isTestPath(f));
	const rejected: ScreenResult["rejected"] = [];
	for (const i of input.issues)
		if (i.repo !== input.repo)
			rejected.push({ reason: "cross-repo-issue", issue: i.number });
	const sameRepo = input.issues
		.filter((i) => i.repo === input.repo)
		.map((i) => i.number);
	if (!srcFiles.some(isSourceCodePath))
		rejected.push({ reason: "no-src-code-change" });
	if (!testFiles.some((f) => /\.py$/.test(f)))
		rejected.push({ reason: "no-test-change" });
	const prLevel = rejected.some((r) => r.issue === undefined);
	return {
		pr: input.pr,
		issues: prLevel ? [] : sameRepo,
		rejected,
		srcFiles,
		testFiles,
		depsTouched: srcFiles.some(isDependencyPath),
	};
}

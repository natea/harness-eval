import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { computeHumanBaseline } from "../src/brownfield/baseline";
import type {
	GhIssue,
	GhPullRequest,
	TaskData,
} from "../src/brownfield/github";
import {
	isDependencyPath,
	isTestPath,
	testDirs,
} from "../src/brownfield/paths";
import { screenPr } from "../src/brownfield/screen";
import {
	collectImages,
	computeCutoff,
	imageUrls,
	issueOpenedAfterFixStart,
	reconstructIssue,
	rewriteImages,
	textAt,
} from "../src/brownfield/snapshot";

/** Recorded GraphQL responses from the paper-qa / zarr spike (task 1.5). */
const fixture = (name: string): TaskData =>
	JSON.parse(readFileSync(`tests/fixtures/brownfield/${name}.json`, "utf8"));

describe("T* cutoff (task 1.3)", () => {
	test("commits that predate the PR set T* (paper-qa #1311)", () => {
		const { pullRequest: pr, issue } = fixture("paper-qa-1311-1310");
		const c = computeCutoff(pr, issue);
		expect(c.cutBy).toBe("firstPrCommit");
		expect(c.tStar < pr.createdAt).toBe(true);
		expect(Date.parse(c.tStar) - Date.parse(c.cut)).toBe(1000);
	});

	test("an issue opened after fix work began is flagged (paper-qa #370 → #366)", () => {
		const { pullRequest: pr, issue } = fixture("paper-qa-370-366");
		expect(issueOpenedAfterFixStart(issue, computeCutoff(pr, issue))).toBe(
			true,
		);
		const ok = fixture("paper-qa-1311-1310");
		expect(
			issueOpenedAfterFixStart(
				ok.issue,
				computeCutoff(ok.pullRequest, ok.issue),
			),
		).toBe(false);
	});

	test("a cross-reference earlier than any commit wins", () => {
		const pr: GhPullRequest = {
			number: 9,
			createdAt: "2026-08-10T00:00:00Z",
			mergedAt: "2026-08-12T00:00:00Z",
			commits: {
				nodes: [
					{
						commit: {
							authoredDate: "2026-08-09T00:00:00Z",
							committedDate: "2026-08-09T00:00:00Z",
						},
					},
				],
			},
		};
		const issue = synthetic([
			{
				__typename: "CrossReferencedEvent",
				createdAt: "2026-08-05T00:00:00Z",
				source: { __typename: "PullRequest", number: 9 },
			},
		]);
		expect(computeCutoff(pr, issue).cutBy).toBe("firstXref");
	});
});

describe("issue reconstruction (task 1.4)", () => {
	test("a body edited after T* is rewound (zarr #4220)", () => {
		const { pullRequest: pr, issue } = fixture("zarr-python-4239-4220");
		const r = reconstructIssue(issue, computeCutoff(pr, issue).cut);
		expect(r.bodyEditedAfter).toBe(1);
		expect(r.bodySource.startsWith("edit@")).toBe(true);
		expect(r.body).not.toBe(issue.body);
		expect(r.body).toContain("### Description"); // the reporter deleted this heading after T*
		expect(r.selfCheckFailures).toEqual([]);
	});

	test("comments posted after T* are dropped (paper-qa #1250)", () => {
		const { pullRequest: pr, issue } = fixture("paper-qa-1251-1250");
		const c = computeCutoff(pr, issue);
		const r = reconstructIssue(issue, c.cut);
		expect(r.droppedComments).toBe(3);
		expect(r.comments).toHaveLength(3);
		expect(r.comments.every((x) => x.at <= c.cut)).toBe(true);
	});

	test("bot comments are tagged (paper-qa #1310, dosubot)", () => {
		const { pullRequest: pr, issue } = fixture("paper-qa-1311-1310");
		const r = reconstructIssue(issue, computeCutoff(pr, issue).cut);
		expect(r.comments[0]?.author).toBe("dosubot");
		expect(r.comments[0]?.isBot).toBe(true);
	});

	test("title renames and label changes after T* are undone", () => {
		const issue = synthetic([
			{
				__typename: "LabeledEvent",
				createdAt: "2026-08-01T00:00:00Z",
				label: { name: "bug" },
			},
			{
				__typename: "RenamedTitleEvent",
				createdAt: "2026-08-01T01:00:00Z",
				previousTitle: "Crash",
				currentTitle: "Crash on empty input",
			},
			{
				__typename: "RenamedTitleEvent",
				createdAt: "2026-08-20T00:00:00Z",
				previousTitle: "Crash on empty input",
				currentTitle: "Crash on empty input (fixed in #9)",
			},
			{
				__typename: "LabeledEvent",
				createdAt: "2026-08-20T00:00:00Z",
				label: { name: "has-pr" },
			},
			{ __typename: "ClosedEvent", createdAt: "2026-08-21T00:00:00Z" },
		]);
		const r = reconstructIssue(issue, "2026-08-10T00:00:00Z");
		expect(r.title).toBe("Crash on empty input");
		expect(r.labels).toEqual(["bug"]);
		expect(r.state).toBe("OPEN");
		expect(reconstructIssue(issue, "2026-07-01T00:00:00Z").title).toBe("Crash");
	});

	test("a broken edit history is recorded, not trusted", () => {
		const t = textAt(
			"live text",
			[{ editedAt: "2026-01-01T00:00:00Z", diff: "something else" }],
			"2026-02-01T00:00:00Z",
		);
		expect(t.selfCheckOk).toBe(false);
	});
});

describe("images are bundled (task 1.4)", () => {
	test("markdown and <img> images download once and links are rewritten", async () => {
		const text =
			"see ![shot](https://x.test/a.png) and <img src='https://x.test/b'> and ![again](https://x.test/a.png)";
		expect(imageUrls(text)).toEqual([
			"https://x.test/a.png",
			"https://x.test/b",
		]);
		const calls: string[] = [];
		const { assets, failed } = await collectImages([text], async (url) => {
			calls.push(url);
			if (url.endsWith("/b"))
				return { ok: false, contentType: "", bytes: new Uint8Array() };
			return {
				ok: true,
				contentType: "image/png",
				bytes: new Uint8Array([1, 2, 3]),
			};
		});
		expect(calls).toHaveLength(2);
		expect(failed).toEqual(["https://x.test/b"]);
		const out = rewriteImages(text, assets);
		expect(out).not.toContain("https://x.test/a.png");
		expect(out).toMatch(/\(assets\/[0-9a-f]{12}\.png\)/);
	});
});

describe("candidate screening (task 1.2)", () => {
	const base = {
		repo: "acme/w",
		pr: 5,
		issues: [{ number: 1, repo: "acme/w" }],
	};
	test("a code + test PR passes and flags dependency files", () => {
		const r = screenPr({
			...base,
			files: ["src/a.py", "tests/test_a.py", "uv.lock"],
		});
		expect(r.issues).toEqual([1]);
		expect(r.rejected).toEqual([]);
		expect(r.depsTouched).toBe(true);
	});
	test("docs-only, test-only and cross-repo are rejected with reasons", () => {
		expect(
			screenPr({ ...base, files: ["README.md"] }).rejected.map((x) => x.reason),
		).toEqual(["no-src-code-change", "no-test-change"]);
		expect(screenPr({ ...base, files: ["tests/test_a.py"] }).issues).toEqual(
			[],
		);
		const cross = screenPr({
			...base,
			issues: [{ number: 9, repo: "other/x" }],
			files: ["a.py", "tests/test_a.py"],
		});
		expect(cross.issues).toEqual([]);
		expect(cross.rejected).toEqual([{ reason: "cross-repo-issue", issue: 9 }]);
	});
	test("path rules", () => {
		expect(isTestPath("xarray/tests/test_x.py")).toBe(true);
		expect(isTestPath("packages/p/tests/conftest.py")).toBe(true);
		expect(isTestPath("src/attest.py")).toBe(false);
		expect(isDependencyPath("pyproject.toml")).toBe(true);
		expect(
			testDirs([
				"tests/a.py",
				"pkg/tests/b.py",
				"pkg/tests/c/d.py",
				"src/x.py",
			]),
		).toEqual(["pkg/tests", "tests"]);
	});
});

describe("human baseline (task 1.6)", () => {
	const commit = (t: string) => ({
		commit: { authoredDate: t, committedDate: t },
	});
	const pr = (
		reviews: { submittedAt: string | null; state: string }[],
	): GhPullRequest => ({
		number: 1,
		createdAt: "2026-08-01T10:00:00Z",
		mergedAt: "2026-08-03T10:00:00Z",
		commits: {
			nodes: [
				commit("2026-08-01T09:00:00Z"),
				commit("2026-08-01T09:30:00Z"),
				commit("2026-08-01T10:00:00Z"),
				commit("2026-08-02T12:00:00Z"),
				commit("2026-08-02T13:00:00Z"),
			],
		},
		reviews: { nodes: reviews },
		files: {
			nodes: [
				{ path: "src/a.py", additions: 10, deletions: 2 },
				{ path: "tests/test_a.py", additions: 50, deletions: 0 },
			],
		},
	});

	test("reviewed PR: window ends at the last commit before the first review", () => {
		const b = computeHumanBaseline(
			pr([
				{ submittedAt: "2026-08-02T09:00:00Z", state: "CHANGES_REQUESTED" },
				{ submittedAt: null, state: "PENDING" },
				{ submittedAt: "2026-08-03T09:00:00Z", state: "APPROVED" },
			]),
			"2026-08-01T08:59:59Z",
			"2026-07-30T00:00:00Z",
		);
		expect(b.codingWindowMinutes).toBe(60); // 08:59:59 → 10:00 (third commit)
		expect(b.commitsAfterFirstReview).toBe(2);
		expect(b.reviewRounds).toBe(2);
		expect(b.reviewMinutes).toBe(48 * 60);
		expect(b.humanDiff).toEqual({
			linesAdded: 10,
			linesRemoved: 2,
			filesTouched: 1,
		});
	});

	test("unreviewed PR: window ends at the last commit before merge", () => {
		const b = computeHumanBaseline(
			pr([]),
			"2026-08-01T08:59:59Z",
			"2026-07-30T00:00:00Z",
		);
		expect(b.reviewRounds).toBe(0);
		expect(b.commitsAfterFirstReview).toBe(0);
		expect(b.codingWindowMinutes).toBe(
			Math.round(
				(Date.parse("2026-08-02T13:00:00Z") -
					Date.parse("2026-08-01T08:59:59Z")) /
					60000,
			),
		);
	});
});

function synthetic(events: GhIssue["timelineItems"]["nodes"]): GhIssue {
	return {
		number: 1,
		title: "Crash on empty input (fixed in #9)",
		body: "boom",
		createdAt: "2026-07-31T00:00:00Z",
		author: { login: "r" },
		userContentEdits: { nodes: [] },
		comments: { nodes: [] },
		timelineItems: { nodes: events },
	};
}

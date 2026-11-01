import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	appendReview,
	BundleError,
	bundleDir,
	listBundleDirs,
	loadBundle,
	readReviews,
	renderIssueVariant,
	type Snapshot,
	stripFutureLinks,
	type TaskManifest,
	writeManifest,
} from "../src/brownfield/bundle";

const REPO = "acme/widgets";
const MERGE = "abcdef1234567890abcdef1234567890abcdef12";

const snapshot: Snapshot = {
	pr: 42,
	issue: 7,
	tStar: "2026-08-01T00:00:00Z",
	title: "Crash on empty input",
	issueAuthor: "reporter",
	body: "It crashes. See https://github.com/acme/widgets/pull/12 for context.",
	comments: [
		{
			at: "2026-07-30T00:00:00Z",
			author: "maint",
			isBot: false,
			text: "The bug is in parse().",
		},
		{
			at: "2026-07-31T00:00:00Z",
			author: "helperbot",
			isBot: true,
			text: "Maybe check #42 or https://github.com/acme/widgets/pull/42/files",
		},
	],
};

function manifest(): Omit<TaskManifest, "files"> {
	return {
		schemaVersion: 1,
		repo: REPO,
		pr: 42,
		issues: [7],
		baseSha: "1111111",
		mergeSha: MERGE,
		tStar: snapshot.tStar,
		issueCreatedAt: "2026-07-29T00:00:00Z",
		prMergedAt: "2026-08-02T00:00:00Z",
		verdict: "VALID",
		failToPass: ["tests/test_x.py::test_empty"],
		passToPass: [],
		envBroken: [],
		flaky: [],
		testPaths: ["tests"],
		depsTouched: false,
		appEgress: [],
		leak: { body: "symptom", comments: "diagnosis" },
		provisional: true,
	};
}

let root: string;
let dir: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "bf-"));
	dir = join(root, "acme__widgets", "tasks", "pr42-issue7");
	mkdirSync(join(dir, "issue"), { recursive: true });
	writeFileSync(join(dir, "snapshot.json"), JSON.stringify(snapshot));
	writeFileSync(join(dir, "reference.patch"), "diff --git a/x b/x\n");
	writeFileSync(join(dir, "tests.patch"), "diff --git a/t b/t\n");
	writeFileSync(join(dir, "issue", "body.md"), "# Crash\r\n"); // CRLF must survive byte-exact
	writeManifest(dir, manifest());
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("brownfield bundle (task 1.1)", () => {
	test("a freshly written bundle loads and verifies", () => {
		const b = loadBundle(dir);
		expect(b.id).toBe("pr42-issue7");
		expect(b.repoDir).toBe("acme__widgets");
		expect(Object.keys(b.manifest.files).sort()).toEqual([
			"issue/body.md",
			"reference.patch",
			"snapshot.json",
			"tests.patch",
		]);
	});

	test("changing one byte fails verification and names the file", () => {
		writeFileSync(join(dir, "reference.patch"), "diff --git a/x b/y\n");
		expect(() => loadBundle(dir)).toThrow(/hash mismatch: reference\.patch/);
	});

	test("CRLF normalization would be caught (hashes are byte-exact)", () => {
		writeFileSync(join(dir, "issue", "body.md"), "# Crash\n");
		expect(() => loadBundle(dir)).toThrow(/issue\/body\.md/);
	});

	test("missing and unexpected files are reported", () => {
		rmSync(join(dir, "tests.patch"));
		writeFileSync(join(dir, "extra.txt"), "x");
		const msg = (() => {
			try {
				loadBundle(dir);
				return "";
			} catch (e) {
				return (e as Error).message;
			}
		})();
		expect(msg).toContain("missing: tests.patch");
		expect(msg).toContain("unexpected: extra.txt");
	});

	test("review labels are append-only and never change bundle hashes", () => {
		const rec = {
			reviewer: "nate",
			at: "2026-11-01T00:00:00Z",
			items: [
				{ id: "body", label: "symptom" },
				{ id: "c1", label: "diagnosis" },
				{ id: "c2", label: "symptom" },
			],
			fairness: { verdict: "yes", note: "" },
		};
		appendReview(dir, rec);
		const first = readFileSync(join(dir, "review", "labels.jsonl"), "utf8");
		appendReview(dir, { ...rec, reviewer: "second" });
		const both = readFileSync(join(dir, "review", "labels.jsonl"), "utf8");
		expect(both.startsWith(first)).toBe(true);
		expect(readReviews(dir).map((r) => r.reviewer)).toEqual(["nate", "second"]);
		expect(() => loadBundle(dir)).not.toThrow();
	});

	test("a review must label every item exactly once", () => {
		const base = {
			reviewer: "n",
			at: "2026-11-01T00:00:00Z",
			fairness: { verdict: "unsure" },
		};
		expect(() =>
			appendReview(dir, { ...base, items: [{ id: "body", label: "noise" }] }),
		).toThrow(BundleError);
		expect(() =>
			appendReview(dir, {
				...base,
				items: [
					{ id: "body", label: "noise" },
					{ id: "c1", label: "noise" },
					{ id: "c2", label: "noise" },
					{ id: "c9", label: "noise" },
				],
			}),
		).toThrow(/unknown: c9/);
	});

	test("listBundleDirs finds bundles; bundleDir rejects path traversal", () => {
		expect(listBundleDirs(root)).toEqual([dir]);
		expect(() => bundleDir("..", "pr1-issue1", root)).toThrow(BundleError);
		expect(() => bundleDir("acme__widgets", "../../etc", root)).toThrow(
			BundleError,
		);
	});
});

describe("issue variants", () => {
	test("links to the fixing PR are stripped; earlier PRs are kept", () => {
		const out = stripFutureLinks(
			"see #42 and https://github.com/acme/widgets/pull/42/files, not #420 or pull/12",
			REPO,
			42,
			MERGE,
		);
		expect(out).not.toMatch(/pull\/42/);
		expect(out).toContain("#[removed]");
		expect(out).toContain("#420");
		expect(out).toContain("pull/12");
	});

	test("body / body+human / body+all differ only in which comments appear", () => {
		const ctx = { repo: REPO, mergeSha: MERGE };
		const body = renderIssueVariant(snapshot, "body", ctx);
		const human = renderIssueVariant(snapshot, "body+human", ctx);
		const all = renderIssueVariant(snapshot, "body+all", ctx);
		expect(body).not.toContain("parse()");
		expect(human).toContain("The bug is in parse()");
		expect(human).not.toContain("helperbot");
		expect(all).toContain("@helperbot** (bot)");
		expect(all).not.toMatch(/pull\/42/);
		expect(body).toContain("pull/12"); // an earlier PR is legitimate context
	});
});

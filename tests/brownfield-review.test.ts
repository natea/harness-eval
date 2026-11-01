import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agreement, type Pair } from "../src/brownfield/agreement";
import { writeManifest } from "../src/brownfield/bundle";
import {
	agreementSummary,
	getTask,
	listTasks,
	submitReview,
} from "../src/brownfield/review";

describe("agreement (task 2.4)", () => {
	test("Cohen's κ matches the textbook value", () => {
		// po = 35/50 = 0.7; pe = (25·30 + 25·20)/50² = 0.5 → κ = 0.4
		const pairs: Pair[] = [
			...Array<Pair>(20).fill(["symptom", "symptom"]),
			...Array<Pair>(5).fill(["symptom", "diagnosis"]),
			...Array<Pair>(10).fill(["diagnosis", "symptom"]),
			...Array<Pair>(15).fill(["diagnosis", "diagnosis"]),
		];
		const a = agreement(pairs);
		expect(a.n).toBe(50);
		expect(a.observed).toBeCloseTo(0.7);
		expect(a.kappa).toBeCloseTo(0.4);
		// Only adjacent-level disagreements → the quadratic weights cancel out.
		expect(a.weightedKappa).toBeCloseTo(0.4);
		expect(a.confusion.symptom.diagnosis).toBe(5);
		expect(a.perLevel.diagnosis).toEqual({ human: 25, llm: 20, agree: 15 });
	});

	test("weighted κ penalizes distant disagreements more than near ones", () => {
		const base: Pair[] = [
			["noise", "noise"],
			["symptom", "symptom"],
			["diagnosis", "diagnosis"],
			["fix_sketch", "fix_sketch"],
			["fix_code", "fix_code"],
		];
		const near = agreement([...base, ["symptom", "diagnosis"]]);
		const far = agreement([...base, ["noise", "fix_code"]]);
		expect(near.kappa).toBeCloseTo(far.kappa as number); // unweighted: same
		expect(near.weightedKappa as number).toBeGreaterThan(
			far.weightedKappa as number,
		);
	});

	test("undefined κ is null, not NaN", () => {
		expect(agreement([]).kappa).toBeNull();
		expect(agreement([["symptom", "symptom"]]).kappa).toBeNull();
	});
});

let root: string;
const REPO_DIR = "acme__widgets";
const ID = "pr42-issue7";

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "bfr-"));
	const dir = join(root, REPO_DIR, "tasks", ID);
	mkdirSync(join(dir, "issue"), { recursive: true });
	writeFileSync(
		join(dir, "snapshot.json"),
		JSON.stringify({
			pr: 42,
			issue: 7,
			tStar: "2026-08-01T00:00:00Z",
			title: "Crash",
			issueAuthor: "r",
			body: "boom",
			comments: [
				{
					at: "2026-07-31T00:00:00Z",
					author: "m",
					isBot: false,
					role: "maintainer",
					text: "parse() bug",
				},
			],
		}),
	);
	writeFileSync(
		join(dir, "leaks.json"),
		JSON.stringify({
			model: "test-model",
			bodyLevel: "symptom",
			commentsLevel: "diagnosis",
			items: [
				{
					id: "body",
					label: "symptom",
					consistent_with_reference: true,
					reveals_files: [],
					evidence: "boom",
					rationale: "SECRET-RATIONALE",
				},
				{
					id: "c1",
					label: "diagnosis",
					consistent_with_reference: true,
					reveals_files: ["x.py"],
					evidence: "parse()",
					rationale: "r",
				},
			],
		}),
	);
	for (const v of ["body", "body+human", "body+all"])
		writeFileSync(join(dir, "issue", `${v}.md`), `# ${v}`);
	writeFileSync(join(dir, "reference.patch"), "diff");
	writeFileSync(join(dir, "tests.patch"), "diff");
	writeFileSync(join(dir, "validation.json"), "{}");
	writeManifest(dir, {
		schemaVersion: 1,
		repo: "acme/widgets",
		pr: 42,
		issues: [7],
		baseSha: "1111111",
		mergeSha: "2222222",
		tStar: "2026-08-01T00:00:00Z",
		issueCreatedAt: "2026-07-29T00:00:00Z",
		prMergedAt: "2026-08-02T00:00:00Z",
		verdict: "VALID",
		failToPass: [],
		passToPass: [],
		envBroken: [],
		flaky: [],
		testPaths: ["tests"],
		depsTouched: false,
		appEgress: [],
		leak: { body: "symptom", comments: "diagnosis" },
		provisional: true,
	});
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const review = (body: string, c1: string) => ({
	reviewer: "nate",
	at: "2026-11-01T00:00:00Z",
	items: [
		{ id: "body", label: body },
		{ id: "c1", label: c1 },
	],
	fairness: { verdict: "yes", note: "" },
});

describe("review read model (tasks 2.1, 2.3)", () => {
	test("before review, nothing from the classifier is exposed (list or detail)", () => {
		const [t] = listTasks(root);
		expect(t?.leak).toBeNull();
		const d = getTask(REPO_DIR, ID, root);
		expect(d.llm).toBeNull();
		expect(d.agreement).toBeNull();
		expect(JSON.stringify(d)).not.toContain("SECRET-RATIONALE");
		expect(JSON.stringify(d)).not.toContain("test-model");
		expect(d.itemIds).toEqual(["body", "c1"]);
		expect(d.snapshot.comments[0]?.role).toBe("maintainer");
	});

	test("after submitting, labels and per-item agreement appear", () => {
		const d = submitReview(REPO_DIR, ID, review("symptom", "fix_sketch"), root);
		expect(d.llm?.model).toBe("test-model");
		expect(d.agreement).toEqual([
			{ id: "body", human: "symptom", llm: "symptom", agree: true },
			{ id: "c1", human: "fix_sketch", llm: "diagnosis", agree: false },
		]);
		expect(listTasks(root)[0]?.leak).toEqual({
			body: "symptom",
			comments: "diagnosis",
		});
	});

	test("an invalid review is rejected and writes nothing", () => {
		expect(() =>
			submitReview(
				REPO_DIR,
				ID,
				{ ...review("symptom", "noise"), items: [] },
				root,
			),
		).toThrow();
		expect(getTask(REPO_DIR, ID, root).reviews).toHaveLength(0);
	});

	test("agreement summary uses the latest review per task", () => {
		submitReview(REPO_DIR, ID, review("noise", "noise"), root);
		submitReview(REPO_DIR, ID, review("symptom", "fix_sketch"), root);
		const s = agreementSummary(root);
		expect(s.reviewedTasks).toBe(1);
		expect(s.leak.n).toBe(2);
		expect(s.leak.observed).toBeCloseTo(0.5);
		expect(s.disagreements).toEqual([
			{
				repoDir: REPO_DIR,
				id: ID,
				item: "c1",
				human: "fix_sketch",
				llm: "diagnosis",
			},
		]);
		expect(s.fairness.yes).toBe(1);
	});
});

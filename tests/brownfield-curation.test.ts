import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { LeakLabels } from "../src/brownfield/bundle";
import { Budget, callAgent, OverBudgetError } from "../src/brownfield/curation/invoke";
import {
	difficultyRule,
	fairnessQuorum,
	issueReaderVotes,
	leakQuorum,
	localizes,
	ruleHash,
} from "../src/brownfield/curation/quorum";

describe("issue reader prefix votes (D4)", () => {
	test("first localizing prefix votes diagnosis, later ones abstain", () => {
		expect(issueReaderVotes([false, false, true, true, false])).toEqual([
			"symptom",
			"symptom",
			"diagnosis",
			null,
			null,
		]);
	});
	test("body localizes", () => {
		expect(issueReaderVotes([true, false])).toEqual(["diagnosis", null]);
	});
	test("localization needs every reference file", () => {
		expect(localizes(["a.py", "b.py"], ["a.py"])).toBe(true);
		expect(localizes(["a.py"], ["a.py", "b.py"])).toBe(false);
		expect(localizes(["./a.py"], ["a.py"])).toBe(true);
		expect(localizes(["a.py"], [])).toBe(false);
	});
});

describe("leak quorum (D6)", () => {
	const g = (label: any, consistent = true) => ({ label, consistent });
	test("median of three", () => {
		expect(
			leakQuorum({ gold: g("fix_code"), issueReader: "symptom", testAuditor: "diagnosis" }),
		).toBe("diagnosis");
	});
	test("even split resolves higher when the issue reader abstains", () => {
		expect(
			leakQuorum({ gold: g("symptom"), issueReader: null, testAuditor: "diagnosis" }),
		).toBe("diagnosis");
	});
	test("gold cap on a confidently wrong guess", () => {
		expect(
			leakQuorum({
				gold: g("symptom", false),
				issueReader: "diagnosis",
				testAuditor: "diagnosis",
			}),
		).toBe("symptom");
	});
	test("missing gold vote → unlabeled", () => {
		expect(leakQuorum({ gold: null, issueReader: "diagnosis", testAuditor: "symptom" })).toBe(
			"unlabeled",
		);
	});
	test("gold alone", () => {
		expect(leakQuorum({ gold: g("fix_sketch") })).toBe("fix_sketch");
	});
});

describe("fairness and difficulty (D6)", () => {
	test("fair needs both", () => {
		expect(fairnessQuorum("fair", "fair")).toBe("fair");
		expect(fairnessQuorum("fair", "unsure")).toBe("unsure");
		expect(fairnessQuorum("unfair", "fair")).toBe("unfair");
		expect(fairnessQuorum(null, "fair")).toBe("unsure");
	});
	test("difficulty rule", () => {
		expect(difficultyRule({ refLines: 10, bodyLocalizes: true, similarPriorFix: false })).toBe("easy");
		expect(difficultyRule({ refLines: 200, bodyLocalizes: true, similarPriorFix: true })).toBe("hard");
		expect(difficultyRule({ refLines: 50, bodyLocalizes: false, similarPriorFix: false })).toBe("hard");
		expect(difficultyRule({ refLines: 50, bodyLocalizes: true, similarPriorFix: false })).toBe("medium");
	});
	test("rule hash is stable", () => {
		expect(ruleHash()).toMatch(/^[0-9a-f]{64}$/);
		expect(ruleHash()).toBe(ruleHash());
	});
});

describe("budget (D8)", () => {
	test("a call over the cap marks over-budget and blocks the next call", async () => {
		const b = new Budget(0.05);
		const runner = async () => ({ structured: { items: [] }, costUsd: 0.06 });
		await callAgent({ agent: "x", system: "s", prompt: "p", schema: {}, inputManifest: [] }, b, runner);
		expect(b.over).toBe(true);
		await expect(
			callAgent({ agent: "y", system: "s", prompt: "p", schema: {}, inputManifest: [] }, b, runner),
		).rejects.toBeInstanceOf(OverBudgetError);
	});
});

describe("schema compatibility (1.1)", () => {
	test("existing leaks.json parse as single-arm leak items", () => {
		const root = "brownfield/Future-House__paper-qa/tasks";
		const dirs = readdirSync(root).slice(0, 5);
		for (const d of dirs) {
			const f = join(root, d, "leaks.json");
			try {
				LeakLabels.parse(JSON.parse(readFileSync(f, "utf8")));
			} catch (e: any) {
				if (e.code !== "ENOENT") throw e;
			}
		}
	});
});

describe("compare (4.3)", () => {
	const { scoreArm, bundleResamples, kappaDiffCI } = require("../src/brownfield/curation/compare");
	const mk = (task: string, human: Record<string, string>, a: Record<string, string>, b: Record<string, string>) => ({
		task,
		human,
		humanFairness: "fair",
		arms: {
			a: { items: a, fairness: "fair", spendUsd: 0.1, excluded: false },
			b: { items: b, fairness: "unsure", spendUsd: 0.2, excluded: false },
		},
	});
	// Known κ: 4 items, 2 categories, perfect for a; for b, po=0.5 and pe=0.5 → κ=0.
	const fixture = [
		mk("t1", { body: "symptom", c1: "diagnosis" }, { body: "symptom", c1: "diagnosis" }, { body: "symptom", c1: "symptom" }),
		mk("t2", { body: "symptom", c1: "diagnosis" }, { body: "symptom", c1: "diagnosis" }, { body: "diagnosis", c1: "diagnosis" }),
	];
	test("known κ on a synthetic fixture", () => {
		const draws = bundleResamples(2, 200);
		const a = scoreArm(fixture, "a", draws);
		const b = scoreArm(fixture, "b", draws);
		expect(a.kappa).toBe(1);
		expect(b.accuracy).toBe(0.5);
		expect(b.kappa).toBeCloseTo(0, 10);
		expect(a.fairnessAgreement).toBe(1);
		expect(b.fairnessAgreement).toBe(0);
		expect(a.accuracyPerDollar).toBeCloseTo(10, 10);
		expect(kappaDiffCI(fixture, "a", "b", draws)[0]).toBeCloseTo(1, 10);
	});
	test("bootstrap is deterministic", () => {
		expect(bundleResamples(5, 3, 7)).toEqual(bundleResamples(5, 3, 7));
	});
});

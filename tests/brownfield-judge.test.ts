import { describe, expect, test } from "bun:test";
import {
	buildJudgePrompt,
	JUDGE_SCHEMA,
	type JudgeRunner,
	judgeCandidate,
} from "../src/brownfield/judge";
import { assertClassifierIndependent } from "../src/brownfield/classify";

const input = {
	issueTitle: "PDF crash",
	issueBody: "Indexing raises OSError",
	referencePatch: "diff --git a/src.py b/src.py\n+fix\n",
	candidatePatch: "diff --git a/src.py b/src.py\n+maybe\n",
};

const runner =
	(structured: Record<string, unknown>, costUsd = 0.02): JudgeRunner =>
	async (args) => {
		expect(args.schema).toBe(JUDGE_SCHEMA);
		expect(args.model).toBe("judge-model");
		expect(args.prompt).toContain("PDF crash");
		return { structured, costUsd };
	};

describe("judgeCandidate", () => {
	test("returns a structured verdict with cost", async () => {
		const out = await judgeCandidate(input, {
			model: "judge-model",
			runner: runner({
				resolvesIssue: true,
				quality: "good",
				notes: "addresses the crash path",
			}),
		});
		expect(out.resolvesIssue).toBe(true);
		expect(out.quality).toBe("good");
		expect(out.notes).toBe("addresses the crash path");
		expect(out.costUsd).toBe(0.02);
	});

	test("rejects an unknown quality value", async () => {
		await expect(
			judgeCandidate(input, {
				model: "judge-model",
				runner: runner({
					resolvesIssue: true,
					quality: "excellent",
					notes: "",
				}),
			}),
		).rejects.toThrow(/unknown quality/);
	});

	test("prompt carries both diffs and clips long bodies", () => {
		const prompt = buildJudgePrompt({ ...input, issueBody: "x".repeat(9000) });
		expect(prompt).toContain("Candidate diff");
		expect(prompt).toContain("Human reference diff");
		expect(prompt).toContain("truncated");
	});

	test("judge model must differ from the worker model", () => {
		expect(() =>
			assertClassifierIndependent("claude-opus-4-6", "claude-opus-4-6"),
		).toThrow();
		expect(() =>
			assertClassifierIndependent("claude-sonnet-4-6", "claude-opus-4-6"),
		).not.toThrow();
	});
});

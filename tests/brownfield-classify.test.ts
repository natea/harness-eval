import { describe, expect, test } from "bun:test";
import type { Snapshot } from "../src/brownfield/bundle";
import {
	assertClassifierIndependent,
	buildPrompt,
	ClassifierIndependenceError,
	type ClaudeRunner,
	classifyLeaks,
} from "../src/brownfield/classify";

const snapshot: Snapshot = {
	pr: 9,
	issue: 3,
	tStar: "2026-08-01T00:00:00Z",
	title: "Crash",
	issueAuthor: "reporter",
	body: "boom",
	comments: [
		{
			at: "2026-07-30T00:00:00Z",
			author: "fixer",
			isBot: false,
			text: "it's in parse()",
		},
		{
			at: "2026-07-30T01:00:00Z",
			author: "dosubot",
			isBot: true,
			text: "maybe the cache",
		},
		{
			at: "2026-07-30T02:00:00Z",
			author: "core",
			isBot: false,
			assoc: "MEMBER",
			text: "+1",
		},
	],
};

describe("leak classifier (task 3.5)", () => {
	test("prompt carries the reference fix and an author role per item", () => {
		const { prompt, items } = buildPrompt({
			snapshot,
			referencePatch: "diff --git a/p.py",
			prAuthor: "fixer",
		});
		expect(prompt).toContain("diff --git a/p.py");
		expect(items.map((i) => i.role)).toEqual([
			"issue author",
			"future fixer (author of the reference PR)",
			"bot",
			"maintainer",
		]);
	});

	test("labels are attributed (model, prompt hash) and strata derived", async () => {
		const seen: { model?: string } = {};
		const runner: ClaudeRunner = async (args) => {
			seen.model = args.model;
			return {
				costUsd: 0.01,
				structured: {
					items: ["body", "c1", "c2", "c3"].map((id, i) => ({
						id,
						label: ["symptom", "diagnosis", "symptom", "noise"][i],
						consistent_with_reference: id !== "c2",
						reveals_files: [],
						evidence: "",
						rationale: "",
					})),
				},
			};
		};
		const r = await classifyLeaks(
			{ snapshot, referencePatch: "d", prAuthor: "fixer", model: "judge-x" },
			runner,
		);
		expect(seen.model).toBe("judge-x");
		expect(r.model).toBe("judge-x");
		expect(r.promptHash).toMatch(/^[0-9a-f]{64}$/);
		expect(r.bodyLevel).toBe("symptom");
		expect(r.commentsLevel).toBe("diagnosis");
		expect(r.items[2]?.role).toBe("bot");
	});

	test("a classifier that skips an item is an error, not a silent gap", async () => {
		const runner: ClaudeRunner = async () => ({
			costUsd: 0,
			structured: {
				items: [
					{
						id: "body",
						label: "noise",
						consistent_with_reference: true,
						reveals_files: [],
						evidence: "",
						rationale: "",
					},
				],
			},
		});
		await expect(
			classifyLeaks({ snapshot, referencePatch: "d", prAuthor: "x" }, runner),
		).rejects.toThrow(/skipped items: c1, c2, c3/);
	});

	test("classifier model must differ from the worker model", () => {
		expect(() =>
			assertClassifierIndependent("claude-sonnet-5-5", "claude-sonnet-5-5"),
		).toThrow(ClassifierIndependenceError);
		expect(() =>
			assertClassifierIndependent("claude-sonnet-5-5", "claude-opus-5-5"),
		).not.toThrow();
	});
});

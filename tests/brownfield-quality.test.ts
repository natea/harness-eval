import { expect, test } from "bun:test";
import { compareQuality, QUALITY_CRITERIA } from "../src/brownfield/quality";
import type { JudgeRunner } from "../src/brownfield/judge";

const all = (n: number) =>
	Object.fromEntries(QUALITY_CRITERIA.map((c) => [c.id, n]));
const notes = Object.fromEntries(
	QUALITY_CRITERIA.map((c) => [c.id, "A is tidier than B"]),
);

test("blind A/B labels are mapped back; sides alternate so position bias cancels", async () => {
	const prompts: string[] = [];
	// A judge with pure position bias: always scores A 8, B 4, prefers A.
	const biased: JudgeRunner = async ({ prompt }) => {
		prompts.push(prompt);
		return {
			structured: {
				a: all(8),
				b: all(4),
				notes,
				preference: "A",
				rationale: "A is better than B",
			},
			costUsd: 0.01,
		};
	};
	const r = await compareQuality(
		{
			issueTitle: "t",
			issueBody: "b",
			candidatePatch: "DIFF-ONE",
			humanPatch: "DIFF-TWO",
		},
		{ model: "judge", samples: 2, runner: biased },
	);
	// Sample 1 puts the harness in A, sample 2 in B.
	expect(prompts[0]?.indexOf("DIFF-ONE")).toBeLessThan(
		prompts[0]?.indexOf("DIFF-TWO") ?? 0,
	);
	expect(prompts[1]?.indexOf("DIFF-TWO")).toBeLessThan(
		prompts[1]?.indexOf("DIFF-ONE") ?? 0,
	);
	// The bias cancels: equal medians, one vote each → tie.
	expect(r.harnessScore).toBe(r.humanScore);
	expect(r.votes).toEqual({ harness: 1, human: 1, tie: 0 });
	expect(r.preference).toBe("tie");
	expect(r.criteria[0]?.harnessSamples).toEqual([8, 4]);
	expect(r.criteria[0]?.notes[0]).toBe("harness is tidier than human");
	expect(r.rationales[1]).toBe("human PR is better than harness PR");
	expect(r.costUsd).toBeCloseTo(0.02);
	// The prompt never says which side is human.
	expect(prompts.join(" ")).not.toMatch(/human|harness|merged|reference/i);
});

test("a consistent preference wins the vote and the score", async () => {
	let i = 0;
	const prefersHuman: JudgeRunner = async () => {
		const humanIsA = i++ % 2 === 1;
		return {
			structured: {
				a: all(humanIsA ? 9 : 5),
				b: all(humanIsA ? 5 : 9),
				notes,
				preference: humanIsA ? "A" : "B",
				rationale: "",
			},
			costUsd: 0,
		};
	};
	const r = await compareQuality(
		{ issueTitle: "t", issueBody: "b", candidatePatch: "x", humanPatch: "y" },
		{ model: "judge", samples: 3, runner: prefersHuman },
	);
	expect(r.preference).toBe("human");
	expect(r.humanScore).toBe(90);
	expect(r.harnessScore).toBe(50);
});

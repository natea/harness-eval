import { expect, test } from "bun:test";
import { decideMatch, matchGoals, type Side, type StepResult } from "./scoring";

const step = (
	stepId: string,
	outcome: StepResult["outcome"],
	credit: number,
): StepResult => ({ stepId, outcome, credit });

test("matchGoals: +1 pass, -1 fail, +credit partial", () => {
	const steps = [
		step("a", "pass", 1),
		step("b", "fail", 0),
		step("c", "partial", 0.5),
	];
	// +1 - 1 + 0.5
	expect(matchGoals(steps)).toBeCloseTo(0.5);
});

test("matchGoals: bonus steps are excluded", () => {
	const steps = [step("a", "pass", 1), step("BONUS", "pass", 1)];
	expect(matchGoals(steps, new Set(["BONUS"]))).toBe(1);
});

test("matchGoals: empty is zero", () => {
	expect(matchGoals([])).toBe(0);
});

const side = (p: Partial<Side>): Side => ({
	goals: 0,
	quality: 0,
	tokens: Number.POSITIVE_INFINITY,
	seed: 1,
	...p,
});

test("decideMatch: clean win on goals", () => {
	expect(decideMatch(side({ goals: 5 }), side({ goals: 3 }))).toEqual({
		winner: "A",
		reason: "goals",
	});
	expect(decideMatch(side({ goals: 2 }), side({ goals: 8 }))).toEqual({
		winner: "B",
		reason: "goals",
	});
});

test("decideMatch: tie → quality", () => {
	expect(
		decideMatch(
			side({ goals: 4, quality: 40 }),
			side({ goals: 4, quality: 70 }),
		),
	).toEqual({ winner: "B", reason: "quality" });
});

test("decideMatch: tie + equal quality → efficiency (fewer tokens)", () => {
	expect(
		decideMatch(
			side({ goals: 4, quality: 50, tokens: 1000 }),
			side({ goals: 4, quality: 50, tokens: 2000 }),
		),
	).toEqual({ winner: "A", reason: "efficiency" });
});

test("decideMatch: all equal → seed (lower wins)", () => {
	expect(
		decideMatch(
			side({ goals: 4, quality: 50, tokens: 1000, seed: 3 }),
			side({ goals: 4, quality: 50, tokens: 1000, seed: 1 }),
		),
	).toEqual({ winner: "B", reason: "seed" });
});

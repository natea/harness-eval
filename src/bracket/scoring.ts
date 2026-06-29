/**
 * Bracket-bakeoff goal scoring (bracket-bakeoff). The FIFA layer over a graded
 * trial: each non-bonus PRD step that passes is a goal (+1), a fail is −1, a
 * partial is its fractional credit. Derived read-only from
 * grades.adherence.stepResults — never touches the adherence score or composite.
 */

export type StepOutcome = "pass" | "partial" | "fail";
export interface StepResult {
	stepId: string;
	outcome: StepOutcome;
	credit: number; // [0,1]; pass=1, fail=0, partial in between
}

/** Goals = Σ over non-bonus steps of +1 (pass) / −1 (fail) / +credit (partial). */
export function matchGoals(
	stepResults: StepResult[],
	bonusIds: ReadonlySet<string> = new Set(),
): number {
	let goals = 0;
	for (const s of stepResults) {
		if (bonusIds.has(s.stepId)) continue;
		goals +=
			s.outcome === "pass" ? 1 : s.outcome === "fail" ? -1 : (s.credit ?? 0);
	}
	return goals;
}

export interface Side {
	goals: number;
	quality: number; // absolute codeQuality 0-100
	tokens: number; // worker tokens (lower = better); Infinity when unknown
	seed: number; // lower = better
}
export type Winner = "A" | "B";
export type TiebreakReason = "goals" | "quality" | "efficiency" | "seed";
export interface MatchDecision {
	winner: Winner;
	reason: TiebreakReason;
}

/**
 * Decide a match. Higher goals wins; ties break deterministically by
 * codeQuality → efficiency (fewer tokens, then — folded in — same) → seed. No
 * randomness, so a bracket replays identically. The deciding criterion is
 * recorded so a scoreline is auditable ("won on quality after 3–3").
 */
export function decideMatch(a: Side, b: Side): MatchDecision {
	if (a.goals !== b.goals)
		return { winner: a.goals > b.goals ? "A" : "B", reason: "goals" };
	if (a.quality !== b.quality)
		return { winner: a.quality > b.quality ? "A" : "B", reason: "quality" };
	if (a.tokens !== b.tokens)
		return { winner: a.tokens < b.tokens ? "A" : "B", reason: "efficiency" };
	return { winner: a.seed < b.seed ? "A" : "B", reason: "seed" };
}

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

export interface GoalBreakdown {
	passes: number; // +1 each
	fails: number; // −1 each
	partials: number; // count of partial steps
	partialCredit: number; // Σ credit over partials
	total: number; // the goal score
}

/** Per-outcome breakdown of the goal score over non-bonus steps — how the number
 *  was built (the hover explanation in the bracket view). */
export function goalBreakdown(
	stepResults: StepResult[],
	bonusIds: ReadonlySet<string> = new Set(),
): GoalBreakdown {
	let passes = 0;
	let fails = 0;
	let partials = 0;
	let partialCredit = 0;
	for (const s of stepResults) {
		if (bonusIds.has(s.stepId)) continue;
		if (s.outcome === "pass") passes++;
		else if (s.outcome === "fail") fails++;
		else {
			partials++;
			partialCredit += s.credit ?? 0;
		}
	}
	return {
		passes,
		fails,
		partials,
		partialCredit,
		total: passes - fails + partialCredit,
	};
}

/** Goals = Σ over non-bonus steps of +1 (pass) / −1 (fail) / +credit (partial). */
export function matchGoals(
	stepResults: StepResult[],
	bonusIds: ReadonlySet<string> = new Set(),
): number {
	return goalBreakdown(stepResults, bonusIds).total;
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

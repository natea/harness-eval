/**
 * Retrospective bracket builder (bracket-bakeoff, zero-spend v1). Seeds the
 * candidates already graded on a (target, harness, model) into a single-
 * elimination bracket and plays each match from their existing grades via the
 * goal-scoring + deterministic tiebreak in ./scoring. Read-only over runs/.
 *
 * The spec's live orchestration (fresh head-to-head runs, winner advances after
 * each run — REAL SPEND, tasks 2.2/5.x) layers on top of this same scoring +
 * seeding later; this slice makes the bracket viewable from data we already have.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadTarget } from "../targets";
import {
	decideMatch,
	type GoalBreakdown,
	goalBreakdown,
	type Side,
	type StepResult,
	type TiebreakReason,
} from "./scoring";

/** What the scoreline measures: PRD-pass goals, or code-quality points. */
export type Metric = "goals" | "quality";

export interface Entrant {
	candidate: string;
	seed: number; // seed within this metric
	score: number; // the metric's value — what the bracket is played on
	adherence: number; // absolute prdAdherence
	quality: number; // absolute codeQuality
	goals: number; // PRD-pass goal score
	breakdown: GoalBreakdown; // how the goal score was built (hover explanation)
	costUsd: number | null;
	runId: string;
}
export interface BracketMatch {
	round: number;
	a: string | null; // entrant candidate, or null (empty bracket slot)
	b: string | null;
	goalsA: number | null;
	goalsB: number | null;
	winner: string | null;
	reason: string | null; // tiebreak reason when decided by score/quality/...
	bye: boolean;
}
export interface Bracket {
	target: string;
	harness: string;
	model: string;
	metric: Metric;
	entrants: Entrant[];
	rounds: BracketMatch[][]; // round 0 = first round … last = final
	champion: string | null;
}

const MIN_ENTRANTS = 4;

/** No-framework baselines — the round-1 gatekeeper every framework must beat to
 *  advance. Mirrors BASELINES in src/report/inverse-scaling.ts. */
const BASELINES = new Set(["bare", "codex-baseline"]);

const qualityOf = (g: {
	quality?: { criteria?: { score?: number }[] };
}): number => {
	const c = g.quality?.criteria ?? [];
	return c.length
		? (c.reduce((s, x) => s + (x.score ?? 0), 0) / c.length) * 10
		: 0;
};

/** Standard single-elim slot order for a power-of-two size (seed per slot). */
function seedSlots(size: number): number[] {
	let slots = [1, 2];
	while (slots.length < size) {
		const total = slots.length * 2 + 1;
		const next: number[] = [];
		for (const s of slots) {
			next.push(s);
			next.push(total - s);
		}
		slots = next;
	}
	return slots;
}

const nextPow2 = (n: number) => {
	let p = 1;
	while (p < n) p *= 2;
	return p;
};

type Raw = {
	adherence: number;
	quality: number;
	costUsd: number | null;
	steps: StepResult[];
	runId: string;
};

/** Scan runs/ and build every bracketable (target, harness, model) group. */
export async function buildBrackets(
	runsDir: string,
	targetsDir = "targets",
): Promise<Bracket[]> {
	const targetBySha = new Map<string, string>();
	const bonusByTarget = new Map<string, Set<string>>();
	for (const name of readdirSync(targetsDir)) {
		if (!existsSync(join(targetsDir, name, "target.yaml"))) continue;
		try {
			const t = loadTarget(name, targetsDir);
			targetBySha.set(t.prdSha256, name);
			bonusByTarget.set(
				name,
				new Set(t.plan.steps.filter((s) => s.bonus).map((s) => s.id)),
			);
		} catch {
			/* skip */
		}
	}

	// best graded trial per (target|harness|model|candidate), keyed by adherence
	const best = new Map<string, Raw>();
	const consider = (
		// biome-ignore lint/suspicious/noExplicitAny: loose provenance/grades JSON
		p: any,
		// biome-ignore lint/suspicious/noExplicitAny: loose grades JSON
		g: any,
		runId: string,
	) => {
		const adh = g?.adherence?.gradedScore;
		if (typeof adh !== "number") return;
		const target = targetBySha.get(p.prdSha256) ?? `unknown:${p.prdSha256}`;
		const key = [target, p.harness, p.model, p.candidate].join("|");
		const prev = best.get(key);
		if (prev && prev.adherence >= adh) return;
		best.set(key, {
			adherence: adh,
			quality: qualityOf(g),
			costUsd: typeof p.__cost === "number" ? p.__cost : (g.__cost ?? null),
			steps: (g.adherence?.stepResults ?? []) as StepResult[],
			runId,
		});
	};

	for (const d of readdirSync(runsDir)) {
		const rp = join(runsDir, d, "results.json");
		if (existsSync(rp)) {
			const j = await Bun.file(rp).json();
			for (const t of j.trials ?? []) {
				const cost = t.telemetry?.totalCostUsd ?? null;
				consider({ ...t.provenance, __cost: cost }, t.grades, d);
			}
		} else {
			const trialsDir = join(runsDir, d, "trials");
			if (!existsSync(trialsDir)) continue;
			for (const tid of readdirSync(trialsDir)) {
				const pp = join(trialsDir, tid, "provenance.json");
				const gp = join(trialsDir, tid, "grades.json");
				if (!existsSync(pp) || !existsSync(gp)) continue;
				consider(await Bun.file(pp).json(), await Bun.file(gp).json(), d);
			}
		}
	}

	// group by (target, harness, model)
	const groups = new Map<string, Map<string, Raw>>();
	for (const [key, raw] of best) {
		const [target, harness, model, cand] = key.split("|");
		const gk = `${target}|${harness}|${model}`;
		const m = groups.get(gk) ?? new Map<string, Raw>();
		m.set(cand ?? "?", raw);
		groups.set(gk, m);
	}

	const brackets: Bracket[] = [];
	for (const [gk, cands] of groups) {
		if (cands.size < MIN_ENTRANTS) continue;
		const [target = "", harness = "", model = ""] = gk.split("|");
		const bonusIds = bonusByTarget.get(target) ?? new Set<string>();
		const bases = [...cands.entries()].map(([candidate, r]) => {
			const breakdown = goalBreakdown(r.steps, bonusIds);
			return {
				candidate,
				adherence: r.adherence,
				quality: r.quality,
				goals: breakdown.total,
				breakdown,
				costUsd: r.costUsd,
				runId: r.runId,
			};
		});
		// One bracket per metric — the view lets you toggle (e.g. quality when
		// adherence/goals are saturated and the goals bracket is a wash).
		brackets.push(playFor("goals", target, harness, model, bases));
		brackets.push(playFor("quality", target, harness, model, bases));
	}
	// biggest first; goals before quality within a group
	brackets.sort(
		(a, b) =>
			b.entrants.length - a.entrants.length ||
			a.target.localeCompare(b.target) ||
			(a.metric === b.metric ? 0 : a.metric === "goals" ? -1 : 1),
	);
	return brackets;
}

type Base = Omit<Entrant, "seed" | "score">;

/** Relabel decideMatch's generic primary/secondary reason for the metric. */
function reasonLabel(metric: Metric, raw: TiebreakReason): string {
	if (raw === "efficiency" || raw === "seed") return raw;
	if (metric === "goals") return raw; // "goals" → goals, "quality" → quality
	return raw === "goals" ? "quality" : "goals"; // primary/secondary swap
}

/** Build the seeded single-elimination rounds for a pool of entrants, numbering
 *  rounds from `startRound`. Returns the rounds plus the champion (the pool's
 *  winner). A pool of 0 → no rounds, null champion; a pool of 1 → no rounds, that
 *  entrant is champion (it has nobody left to play). */
function seededRounds(
	metric: Metric,
	pool: Entrant[],
	byName: Map<string, Entrant>,
	sideOf: (e: Entrant) => Side,
	startRound: number,
): { rounds: BracketMatch[][]; champion: string | null } {
	if (pool.length <= 1)
		return { rounds: [], champion: pool[0]?.candidate ?? null };
	const size = nextPow2(pool.length);
	const slots = seedSlots(size).map((seed) =>
		seed <= pool.length ? (pool[seed - 1]?.candidate ?? null) : null,
	);
	const rounds: BracketMatch[][] = [];
	let current = slots; // candidate names (or null = bye) entering this round
	let round = startRound;
	while (current.length > 1) {
		const matches: BracketMatch[] = [];
		const winners: (string | null)[] = [];
		for (let i = 0; i < current.length; i += 2) {
			const a = current[i] ?? null;
			const b = current[i + 1] ?? null;
			const ea = a ? byName.get(a) : undefined;
			const eb = b ? byName.get(b) : undefined;
			let winner: string | null = null;
			let reason: string | null = null;
			let bye = false;
			if (ea && !eb) {
				winner = a;
				bye = true;
			} else if (eb && !ea) {
				winner = b;
				bye = true;
			} else if (ea && eb) {
				const d = decideMatch(sideOf(ea), sideOf(eb));
				winner = d.winner === "A" ? a : b;
				reason = reasonLabel(metric, d.reason);
			}
			matches.push({
				round,
				a,
				b,
				goalsA: ea?.score ?? null,
				goalsB: eb?.score ?? null,
				winner,
				reason,
				bye,
			});
			winners.push(winner);
		}
		rounds.push(matches);
		current = winners;
		round++;
	}
	return { rounds, champion: current[0] ?? null };
}

function playFor(
	metric: Metric,
	target: string,
	harness: string,
	model: string,
	bases: Base[],
): Bracket {
	const scoreOf = (b: Base) => (metric === "goals" ? b.goals : b.quality);
	// seed by the metric desc (stable by name)
	const entrants: Entrant[] = [...bases]
		.sort(
			(a, b) =>
				scoreOf(b) - scoreOf(a) || a.candidate.localeCompare(b.candidate),
		)
		.map((b, i) => ({ ...b, seed: i + 1, score: scoreOf(b) }));

	const byName = new Map(entrants.map((e) => [e.candidate, e]));
	// decideMatch compares primary then secondary; feed the metric as primary.
	const sideOf = (e: Entrant): Side => ({
		goals: e.score,
		quality: metric === "goals" ? e.quality : e.goals,
		tokens: e.costUsd ?? Number.POSITIVE_INFINITY,
		seed: e.seed,
	});

	// The baseline (bare / codex-baseline) is the round-1 gatekeeper, not a normal
	// seed: every framework must beat it to advance. Losing to bare is an UPSET and
	// knocks the framework out. With no baseline (or no frameworks), fall back to a
	// plain seeded single-elim over everyone.
	const baseline = entrants.find((e) => BASELINES.has(e.candidate));
	const frameworks = entrants.filter((e) => !BASELINES.has(e.candidate));

	if (!baseline || frameworks.length === 0) {
		const { rounds, champion } = seededRounds(
			metric,
			entrants,
			byName,
			sideOf,
			0,
		);
		return { target, harness, model, metric, entrants, rounds, champion };
	}

	// Round 0 — the gauntlet: each framework vs the baseline. Winners (frameworks
	// that beat bare) advance; an upset (bare wins) eliminates that framework.
	const baseSide = sideOf(baseline);
	const playIn: BracketMatch[] = [];
	const advancers: Entrant[] = [];
	for (const f of frameworks) {
		const d = decideMatch(sideOf(f), baseSide);
		const frameworkWon = d.winner === "A";
		playIn.push({
			round: 0,
			a: f.candidate,
			b: baseline.candidate,
			goalsA: f.score,
			goalsB: baseline.score,
			winner: frameworkWon ? f.candidate : baseline.candidate,
			reason: reasonLabel(metric, d.reason),
			bye: false,
		});
		if (frameworkWon) advancers.push(f);
	}

	// Rounds 1+ — the frameworks that beat bare play each other to a champion.
	const winners = seededRounds(metric, advancers, byName, sideOf, 1);
	const champion =
		advancers.length === 0 ? baseline.candidate : winners.champion;
	return {
		target,
		harness,
		model,
		metric,
		entrants,
		rounds: [playIn, ...winners.rounds],
		champion,
	};
}

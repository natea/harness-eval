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
import { decideMatch, matchGoals, type Side, type StepResult } from "./scoring";

export interface Entrant {
	candidate: string;
	seed: number;
	adherence: number; // absolute prdAdherence (also the seed key)
	quality: number; // absolute codeQuality
	goals: number;
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
	entrants: Entrant[];
	rounds: BracketMatch[][]; // round 0 = first round … last = final
	champion: string | null;
}

const MIN_ENTRANTS = 4;

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
		// seed by adherence desc (stable by name for ties)
		const ordered = [...cands.entries()].sort(
			(a, b) => b[1].adherence - a[1].adherence || a[0].localeCompare(b[0]),
		);
		const entrants: Entrant[] = ordered.map(([candidate, r], i) => ({
			candidate,
			seed: i + 1,
			adherence: r.adherence,
			quality: r.quality,
			goals: matchGoals(r.steps, bonusIds),
			costUsd: r.costUsd,
			runId: r.runId,
		}));
		brackets.push(playBracket(target, harness, model, entrants));
	}
	// biggest, most-decided brackets first
	brackets.sort((a, b) => b.entrants.length - a.entrants.length);
	return brackets;
}

function playBracket(
	target: string,
	harness: string,
	model: string,
	entrants: Entrant[],
): Bracket {
	const byName = new Map(entrants.map((e) => [e.candidate, e]));
	const sideOf = (e: Entrant): Side => ({
		goals: e.goals,
		quality: e.quality,
		tokens: e.costUsd ?? Number.POSITIVE_INFINITY,
		seed: e.seed,
	});

	const size = nextPow2(entrants.length);
	const slots = seedSlots(size).map((seed) =>
		seed <= entrants.length ? (entrants[seed - 1]?.candidate ?? null) : null,
	);

	const rounds: BracketMatch[][] = [];
	let current = slots; // candidate names (or null = bye) entering this round
	let round = 0;
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
				reason = d.reason;
			}
			matches.push({
				round,
				a,
				b,
				goalsA: ea?.goals ?? null,
				goalsB: eb?.goals ?? null,
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
	return {
		target,
		harness,
		model,
		entrants,
		rounds,
		champion: current[0] ?? null,
	};
}

# Add: Bracket Bakeoff (framework competition as a spectator sport)

## Why

codingharness already runs candidates head-to-head and grades each step of a
frozen PRD as pass / partial / fail (file: src/grading/evaluator.ts;
file: src/types.ts, `StepResult` with `outcome` + `credit` + `weight`). That is
exactly a scoreline waiting to happen. Today the output is a leaderboard table —
accurate, but not something you'd *watch*.

A **bracket bakeoff** turns a run into a tournament: for a single given PRD,
frameworks (or harnesses) are seeded into a single-elimination bracket and play
1v1 matches. Each PRD step that passes is a **goal** (+1); a failed step is −1; a
partial is its fractional credit — the same partial-credit the leaderboard already
uses. The higher score advances to the next round; the bracket fills in like the
FIFA knockout stage until one framework lifts the trophy.

This is cheap to build because it is a *scoring + orchestration + view* layer over
machinery we already have (runs, grading, run-state, the studio). It makes the
eval legible to people who would never read a rubric, and it gives each framework
a narrative: who beat whom, on which PRD, by what scoreline.

## What Changes

- **Match = head-to-head run.** Two entrants build the *same* frozen PRD with the
  identical base prompt (fairness invariant preserved), each graded normally
  (reuse src/studio/launcher.ts `launchRun` / run-exec). A match references the two
  trials + the computed scoreline.
- **Goal scoring (the FIFA layer).** A match score per entrant = Σ over non-bonus
  steps of `+1` (pass), `−1` (fail), `+credit` (partial), derived read-only from
  `grades.adherence.stepResults`. Higher total wins. Ties go to a deterministic
  **penalty shootout** (code-quality, then efficiency, then seed) — never a coin
  flip you can't reproduce.
- **Single-elimination bracket.** Reproducible seeding (recorded seed), byes for
  non-power-of-2 fields, winners advance, persisted `bracket.json` (mirrors the
  durable run-state pattern, file: src/studio/run-state.ts).
- **Studio Bracket view.** A bracket tree (rounds, matchups, scorelines, winners)
  plus the live current match, reusing the live-stream/run-state infra.

## Out of scope (this change)

- **The goal-cast animation** — the spectator polish where a passing step fires a
  goal animation and the scoreline ticks up live as the two frameworks build. It is
  the headline follow-up and is *designed for* here (the match emits per-step goal
  events), but the animated match-cast ships as a **Phase 2** change.
- Group stages, double-elimination, third-place playoff, a multi-PRD "World Cup",
  and any betting/odds layer — all natural sequels, none in v1.
- Any change to how trials are graded or how the composite is computed.

## Impact

- New capability: `bracket-bakeoff`.
- Modified capability: `eval-studio` (a Bracket view; the goal-cast animation is a
  follow-up requirement).
- Reuses: src/studio/launcher.ts, src/studio/run-exec.ts, src/studio/run-state.ts,
  src/grading/evaluator.ts, src/grading (stepResults). **REAL SPEND**: an N-entrant
  bracket runs N−1 matches × 2 builds each — explicit and bounded per bracket.
- Fairness preserved: one frozen PRD per bracket, identical base prompt per match,
  judge ≠ worker, seeding recorded for reproducibility.

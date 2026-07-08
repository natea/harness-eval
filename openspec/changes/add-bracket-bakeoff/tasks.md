# Tasks: Add Bracket Bakeoff

## 1. Goal scoring (the FIFA layer)

- [x] 1.1 Pure function `matchGoals(stepResults)` → Σ over non-bonus steps of +1
  (pass) / −1 (fail) / +credit (partial); derived read-only from
  `grades.adherence.stepResults`, never mutating adherence/composite
- [x] 1.2 `decideMatch(trialA, trialB)` → winner + scoreline, with the deterministic
  tiebreak chain (codeQuality → efficiency → seed) and a recorded `tiebreak` reason
- [x] 1.3 Unit tests: pass/partial/fail goal values, bonus steps excluded, each
  tiebreak branch, and a clean win

## 2. Bracket model + orchestration

- [x] 2.1 `bracket.json` schema (rounds, matches, runRefs, scoreline, winner,
  status) + reproducible seeding from a recorded integer seed; byes for
  non-power-of-2 fields
- [ ] 2.2 Bracket runner: sequential match → launch (reuse src/studio/launcher.ts)
  → grade → score → advance winner → persist; resumable after restart (mirror
  src/studio/run-state.ts reconcile)
- [ ] 2.3 Spend guard: compute + surface projected matches (N−1) × 2 builds and
  cost before the bracket starts; never silently fan out

## 3. Studio Bracket view

- [x] 3.1 `/api/brackets` + `/api/brackets/:id` endpoints over `brackets/`
- [x] 3.2 Bracket view: rounds left→right, matchups, scorelines, winners
  highlighted; the live current match links to the trial pages and reuses the
  live-build stream
- [x] 3.3 Show goals AND weighted adherence per match so the scoreline isn't
  mistaken for the rubric score (design risk)
- [x] 3.4 Baseline-gauntlet first round: round 1 pits every framework against the
  no-framework baseline (bare); beating bare advances, losing is an upset that
  eliminates the framework; survivors play a seeded single-elim. Builder
  (`playFor` in src/bracket/bracket.ts) + renderer generalized so the layout/
  connectors handle the uneven gauntlet→winners fan-in (no binary-tree assumption)
  and upset lines dead-end. Falls back to plain seeded single-elim with no baseline.

## 4. Emit the goal-event stream (for the Phase-2 animation)

- [ ] 4.1 Surface a stable per-step goal-event stream from the live match (pass =
  goal, fail = miss, partial = credit), riding the existing per-step evaluator
  events (src/grading/cc-driver.ts) — data only, no animation yet

## 5. Validate

- [ ] 5.1 Smoke a 4-entrant bracket on one target (REAL SPEND, n=1 per match);
  confirm seeding, advancement, tiebreak, and persistence/resume work
- [ ] 5.2 Confirm fairness invariants hold per match (identical base prompt, frozen
  PRD, judge ≠ worker) and the projected-spend guard fired

## 6. Follow-up (separate changes)

- [ ] 6.1 Phase 2 — goal-cast animation (pitch/ball/scoreline) subscribing to the
  goal-event stream from 4.1
- [ ] 6.2 Sequels: best-of-3 legs, group stage, multi-PRD "World Cup", odds/standings

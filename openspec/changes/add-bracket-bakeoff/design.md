# Design: Bracket Bakeoff

## Context

A graded trial records, per PRD step, `{ stepId, outcome: pass|partial|fail,
credit: 0..1, evidence }` plus the step's `weight` and `bonus` flag (file:
src/types.ts, `StepResult`; file: src/grading/evaluator.ts). The evaluator already
sums `credit × weight` over non-bonus steps for the adherence score. Runs are
launched and tracked durably (file: src/studio/launcher.ts `launchRun`;
file: src/studio/run-state.ts). A bracket is a thin orchestration + scoring + view
layer on top.

## Decisions

### 1. The match

A **match** is two entrants building the *same* target (one frozen PRD), each as a
normal trial with the identical rendered base prompt — the existing fairness
invariant carries over unchanged. The match runs both sides, grades both, computes
a scoreline, and records `{ matchId, target, entrantA, entrantB, runRefs[2],
goalsA, goalsB, winner, tiebreak? }`.

Entrants are registry candidates (a candidate already binds harness + framework),
so "frameworks **or** harnesses competing" is just which candidates you seed.

### 2. Goal scoring (the FIFA layer)

For an entrant's graded trial, over **non-bonus** steps:

```
goal(step) = +1            if outcome = pass
           = −1            if outcome = fail
           = credit (0..1) if outcome = partial
goals(entrant) = Σ goal(step)
```

Higher `goals` wins. This is a derived *lens* over `stepResults` — it does not
touch the adherence score or the composite. Pass = +1 and fail = −1 are the
user's spec; partial reuses the same `credit` the leaderboard already trusts.
Bonus steps are excluded from goals (they're not part of the Definition of Done)
but can be shown as "bonus goals" cosmetically.

### 3. Ties → deterministic penalty shootout

Equal `goals` resolves in order, first decisive wins:
1. higher absolute `codeQuality` (the blind judge),
2. higher efficiency (fewer worker tokens, then faster),
3. better seed (lower seed number).

No randomness in the tiebreak — a bracket must replay identically. The resolving
criterion is recorded in `tiebreak` so the scoreline is auditable ("won on quality
after 3–3").

### 4. The bracket

Single elimination. Seeding is reproducible from a recorded integer seed (default:
prior leaderboard rank for the target if available, else registry order; the seed
is stored so a bracket re-runs identically). Non-power-of-2 fields get top seeds a
**bye** in round 1. Winners advance; the loser is out. State persists to
`brackets/<id>/bracket.json` — rounds, each match's status + runRefs + scoreline +
winner — mirroring the durable run-state pattern so the studio can show progress
and resume after a restart.

### 5. Orchestration — one match at a time

Matches in a round run **sequentially** by default (spectator-friendly: there's
one game to watch), each via the existing `launchRun`. A bracket runner advances
match → grade → score → next match, updating `bracket.json`. Sequential also keeps
spend legible and avoids provider contention; a `concurrency` knob can parallelize
a round later.

### 6. Studio Bracket view

A new view renders the bracket tree (rounds left→right, matchups, scorelines,
winners highlighted) and the **live current match** — reusing run-state + the
live-build stream already wired for trials. `/api/brackets` + `/api/brackets/:id`
serve the structure; the current match links to the normal trial pages.

### 7. The goal-cast animation (follow-up, designed-for here)

The headline sequel is the animated match-cast: as the two frameworks build, each
passing step fires a **goal** animation and the scoreline ticks; a failed step is a
miss. The substrate exists — the evaluator emits per-step outcomes (file:
src/grading/cc-driver.ts streams `{stepId, outcome, credit}`), and the live-stream
already taps a building trial. So this change **emits a stable per-step goal-event
stream** the Phase-2 animation can subscribe to, but the animation itself (pitch,
ball, crowd) is a separate change.

## Risks / trade-offs

- **Real spend scales with field size** — N entrants = N−1 matches × 2 builds. The
  bracket must show the projected build count + cost before it starts and never
  silently fan out; bound by one frozen PRD per bracket.
- **Goals vs. adherence can disagree** — an entrant can win on raw step *count*
  while another has higher weighted adherence (heavy steps). That's intended (it's
  a different game), but the view must show both so the scoreline isn't mistaken
  for the rubric score.
- **Single-trial variance** — one match is n=1; an upset may be noise. v1 states
  this; a "best-of-3 legs" option is a follow-up, not a default (spend).
- **Seeding bias** — seeding affects who meets whom; recording the seed keeps it
  reproducible and lets a rematch reseed deliberately.

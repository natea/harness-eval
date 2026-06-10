# Coding-Framework Leaderboard — n=1 baseline (2026-06-10)

All four frameworks built the Symphony daemon spec with Claude Code 2.1.170 +
Opus 4.6 in Daytona sandboxes; graded by the subscription CC driver
(claude-sonnet-4-6): frozen 22-step test plan + blind 5-criterion judge.
**n=1 per candidate — treat as baseline, not verdict.** Speed/spend are
min-max normalized within this candidate set.

| # | Candidate | Composite | PRD adherence (40%) | Quality (25%) | Speed (17.5%) | Spend (17.5%) | Agent time | Cost-equiv | Turns |
|---|-----------|-----------|--------------------|---------------|---------------|---------------|-----------|------|-------|
| 1 | **superpowers** | **76.68** | 84.21 | 32 | 100 | 100 | 13.0m | $3.99 | 51 |
| 2 | **gsd** | **62.36** | 78.25 | 60 | 41.8 | 50.0 | 25.2m | $10.97 | 124 |
| 3 | **compound-engineering** | **50.14** | 75.79 | 60 | 27.5 | 0 | 28.2m | $17.94 | 128 |
| 4 | **agent-skills** | **49.92** | 85.26 | 54 | 0 | 13.3 | 33.9m | $16.09 | 171 |

Ranking conclusive at n=1 weights (no top-two composite overlap), but n=3
trials (task 8.4) are required before drawing durable conclusions.

## Observations

- **Superpowers wins on efficiency, loses on quality.** Fastest and cheapest
  by 2-4x (single-session, skills auto-trigger), strong adherence — but the
  worst code-quality score (32): its blind-judge criteria showed weak tests
  and thin docs. A "move fast" profile.
- **Agent-skills has the BEST adherence (85.26) and the worst efficiency.**
  Its 5-command SDLC pipeline (spec→plan→build→test→review) produced the most
  spec-faithful artifact at nearly 3x superpowers' time/cost. Quality dragged
  by an architecture judge-sample outlier (7,0,8 → median 7) and docs (2).
- **GSD is the balanced profile**: second on everything, best-tied quality.
- **Compound-engineering**: most expensive, middling everywhere else; its
  /ce-* pipeline spent heavily on planning artifacts the rubric doesn't
  reward (docs/brainstorms scrubbed before judging).
- **Documentation is universally poor** (judge scores 2-5 across the board)
  — no framework prompted the agent to write operator docs unprompted.
- All four cleared both fatal cold-start gates; none achieved Pass@1; none
  completely failed. The test plan discriminates well in the 75-86 band.

Full evidence: `runs/combined-n1/` (results.json, scorecard.md) and per-trial
`grades.json` / `cc-verdicts.jsonl` / transcripts in each run directory.

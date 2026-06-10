# Proposal: Add Results Dashboard

## Why

Eval results currently live in per-run `results.json` and `scorecard.md` files — fine for one run, but comparing candidates across runs, drilling from a composite score down to the test-plan step or judge sample that produced it, and seeing an at-a-glance leaderboard all require manually opening files. A local web dashboard over the existing machine-readable results makes the grades explorable and the ranking legible.

## What Changes

- Add a dashboard server (`Bun.serve()` with HTML imports — no separate frontend build system) that reads every `runs/*/results.json` (plus per-trial `grades.json`, provenance, and telemetry) and serves a read-only web UI.
- **Leaderboard view**: top-ranked coding frameworks by composite score, aggregated across selected runs, with per-dimension columns (PRD adherence, code quality, speed, token spend), trial counts, variance, right-censoring and inconclusive-ordering flags, and harness/model filters (ready for the OpenCode/Codex phase).
- **Run view**: a single run's scorecard — ranked candidates, weights used, exclusions, provenance (PRD/test-plan hashes, versions).
- **Trial drill-down**: per-trial detail — every test-plan step with outcome/credit/evidence, judge criteria with all samples and justifications, session telemetry (duration, turns, tokens, cost), and capped/infra-failed status.
- **Criterion comparison**: how each candidate performed on a chosen dimension or test-plan step across trials.
- Re-weighting controls: adjust dimension weights in the UI and recompute composites client-side from stored per-dimension scores (mirrors `report --weights`; no re-grading).
- Read-only by design: the dashboard never mutates run artifacts; markdown scorecards remain the canonical written record.

## Capabilities

### New Capabilities

- `results-dashboard`: Local web UI over run artifacts — leaderboard, run scorecards, trial drill-downs, criterion comparisons, client-side re-weighting.

### Modified Capabilities

_None — consumes the existing `eval-reporting` JSON schema as-is; any schema gap discovered is fixed in that capability via its own delta._

## Impact

- New `src/dashboard/` (server + HTML/React frontend via Bun HTML imports, per stack preferences); `bun run dashboard` script; default bind `localhost` only.
- No new dependencies beyond front-end rendering (React via Bun's built-in bundling); no database — `runs/` is the source of truth, scanned at request time.
- No changes to orchestration or grading; reporting schema is the contract (schemaVersion respected; unknown versions surfaced, not guessed).

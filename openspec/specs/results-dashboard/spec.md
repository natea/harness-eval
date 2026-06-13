# Capability: results-dashboard

## Purpose

Provide a read-only web dashboard over `runs/` artifacts that lets users compare coding-framework candidates via a cross-run leaderboard, drill into a single run's scorecard, trace any score down to its per-trial evidence and judge samples, and re-weight composite scores client-side in parity with the CLI — all without re-running, re-grading, or mutating run artifacts.

## Requirements

### Requirement: Leaderboard
The dashboard SHALL display a leaderboard ranking coding-framework candidates by composite score aggregated across selected completed runs, showing per-dimension scores, trial counts, variance, and right-censoring/inconclusive flags, with filters for run, harness, and model. Run-relative dimensions (speed, token spend) SHALL be visibly labeled as within-run normalized, and aggregations across runs with differing candidate sets SHALL carry a non-comparability warning.

#### Scenario: Top-ranked harness visible at a glance
- **WHEN** the user opens the dashboard root with at least one completed run present
- **THEN** a ranked table shows each candidate's composite score, the four dimension scores, trials counted, and flags, ordered best-first

#### Scenario: Cross-run aggregation warning
- **WHEN** the user selects two runs whose candidate sets differ
- **THEN** speed and token-spend columns display a non-comparability warning while adherence and quality aggregate normally

### Requirement: Run scorecard view
The dashboard SHALL render a single run's full scorecard: ranked candidates with dimension breakdowns, the weight configuration used, excluded trials with reasons, and provenance (PRD hash, test-plan hash, candidate/harness/model versions, judge model, provider).

#### Scenario: Run drill-in
- **WHEN** the user selects a run from the leaderboard
- **THEN** the run view shows its ranking, weights, exclusions, and provenance without consulting any file outside that run's directory

### Requirement: Trial drill-down
The dashboard SHALL render per-trial detail: every test-plan step with outcome, credit, and evidence text; each judge criterion with all samples, the median, and the justification; session telemetry (durations, turns, token breakdown, cost); and trial status including capped/infra-failed causes.

#### Scenario: Tracing a score to its evidence
- **WHEN** the user opens a trial and expands a failed test-plan step
- **THEN** the step's recorded evidence (commands run, output observed) is displayed verbatim

#### Scenario: Judge sample transparency
- **WHEN** the user views the code-quality section of a trial
- **THEN** each criterion shows all judge samples (e.g. 5,7,7), the recorded median, and the median sample's justification

### Requirement: Client-side re-weighting
The dashboard SHALL let the user adjust dimension weights and recompute composite scores and rankings instantly from stored per-dimension scores, using the same shared scoring module as the CLI, without re-running or re-grading. UI-adjusted weights are ephemeral and SHALL NOT modify run artifacts.

#### Scenario: Re-weighting parity with CLI
- **WHEN** the user sets weights matching a `report --weights` invocation for the same run
- **THEN** the dashboard's composite scores equal the CLI-generated results.json composites exactly

### Requirement: Read-only over run artifacts
The dashboard server SHALL only read from `runs/` and SHALL bind to localhost by default. Runs with an unknown results schemaVersion SHALL be listed with a regeneration notice rather than rendered incorrectly or crashing the page.

#### Scenario: Unknown schema version
- **WHEN** a run directory contains a results.json with a schemaVersion the dashboard does not support
- **THEN** the run appears in the run list marked unsupported with guidance to regenerate via the CLI, and all other runs render normally

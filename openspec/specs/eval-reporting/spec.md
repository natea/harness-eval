# eval-reporting Specification

## Purpose
TBD - created by archiving change setup-harness-eval-framework. Update Purpose after archive.
## Requirements
### Requirement: Scorecard report
The system SHALL generate, per run, a markdown scorecard containing: a ranked candidate table with composite scores; per-dimension breakdowns (PRD adherence Graded Score / Pass@1 / Complete Failure Rate, code-quality criterion scores, speed, token spend and cost); per-trial raw metrics; and the weight configuration used.

#### Scenario: Ranked output
- **WHEN** a run with 4 candidates completes
- **THEN** the report ranks all candidates by composite score and shows, for each, the dimension scores and the underlying raw values (minutes, tokens, USD, Graded Score)

### Requirement: Variance reporting
For runs with multiple trials per candidate, the report SHALL show mean, min, max, and standard deviation per dimension per candidate, and SHALL flag any ranking where the top two candidates' composite-score ranges overlap as statistically inconclusive.

#### Scenario: Overlapping ranges flagged
- **WHEN** candidate A scores 78 ± 9 and candidate B scores 74 ± 8 across trials
- **THEN** the report still ranks A first but flags the A/B ordering as inconclusive given overlapping ranges

### Requirement: Provenance and reproducibility section
The report SHALL include a provenance section sufficient to reproduce the run: PRD content hash, test-plan content hash, candidate versions, harness and model versions, judge model ID, isolation provider and snapshot, and run timestamps. Excluded trials (`infra-failed`, `skipped:budget`) SHALL be listed with reasons.

#### Scenario: Reproducibility audit
- **WHEN** a reader follows the provenance section of a report
- **THEN** they can identify the exact PRD revision, test plan, candidate versions, and configuration needed to re-execute the run without consulting anything outside the report and the repository

### Requirement: Machine-readable results
Alongside the markdown report, the system SHALL emit the full results as a JSON document (per-trial metrics, per-dimension scores, composite scores, provenance) suitable for cross-run comparison when later phases add OpenCode and Codex harnesses.

#### Scenario: Cross-harness comparison input
- **WHEN** a future run executes the same candidates on a different harness
- **THEN** both runs' JSON results share the same schema, keyed by (candidate, harness, model), enabling a combined comparison report


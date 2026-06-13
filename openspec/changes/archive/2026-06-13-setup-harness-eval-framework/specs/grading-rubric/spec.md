# Capability: grading-rubric

## ADDED Requirements

### Requirement: Frozen PRD-adherence test plan
The system SHALL grade PRD adherence against a versioned test plan derived from the Symphony spec's §17 Test and Validation Matrix and §18.1 REQUIRED-for-Conformance checklist (18 items). The test plan SHALL be authored and frozen before any graded trial runs, SHALL assign each step an identifier, weight, and observable check, and MUST NOT change within a run.

#### Scenario: Test plan freeze
- **WHEN** a graded run starts
- **THEN** the run records the content hash of the test plan, and every trial in the run is graded against that identical plan

#### Scenario: Conformance coverage
- **WHEN** the shipped test plan is validated
- **THEN** every §18.1 REQUIRED item maps to at least one test-plan step, and OPTIONAL/RECOMMENDED spec items (e.g., §13.7 HTTP server) are marked as non-scoring bonus signals

### Requirement: ViBench-style adaptive functional evaluation
The system SHALL evaluate PRD adherence by executing the test plan against the candidate's built artifact with an adaptive LLM evaluator that can run the service, drive it with a provided mock Linear tracker API and stub coding-agent app-server, inspect logs and the filesystem, and record per-step outcomes of pass, partial, or fail with evidence. The evaluator SHALL produce three metrics per trial: Graded Score (weighted partial credit, 0–100), Pass@1 (all REQUIRED steps pass), and Complete Failure Rate inputs (no REQUIRED step passes).

#### Scenario: Daemon evaluated against mock tracker
- **WHEN** the evaluator grades a workspace
- **THEN** it starts the candidate's service configured against the harness-provided mock Linear API and stub app-server, executes test-plan steps (e.g., issue dispatch, retry backoff, workspace cleanup, structured log fields), and records each step's outcome with captured evidence (commands run, output observed)

#### Scenario: Unbuildable artifact
- **WHEN** the candidate workspace fails to build or start after the evaluator's documented bounded setup attempts
- **THEN** functional steps are scored fail with evidence, static steps (file/config presence) are still evaluated, and the trial is flagged toward Complete Failure Rate

### Requirement: Real Integration Profile (bonus tier)
The system SHALL support an optional real-integration evaluation tier per Symphony spec §17.8: the built artifact is configured against a dedicated real Linear project ("Symphony Eval Fixtures" in the Jazkarta workspace) containing a frozen set of 5–8 tiny, deterministic fixture coding tasks with mechanically checkable outcomes. This tier SHALL be scored as a non-composite bonus signal (reported alongside, not inside, the weighted composite), and fixture issue states MUST be reset to an identical baseline before each trial.

#### Scenario: Real-tracker evaluation run
- **WHEN** the real-integration tier is enabled for a trial
- **THEN** the evaluator resets the fixture project's issue states to baseline, starts the candidate's built service against the real Linear API with scoped credentials, and records per-fixture outcomes (polled, dispatched, workspace created, agent run completed, handoff state reached) as bonus-tier evidence

#### Scenario: Tier disabled by default
- **WHEN** a run config does not enable the real-integration tier
- **THEN** all PRD-adherence scoring derives from the mock-tracker test plan, and the report marks the bonus tier as not run

#### Scenario: Fixture set integrity
- **WHEN** the real-integration tier starts and the fixture project's issue set does not match the frozen fixture manifest (content hash)
- **THEN** the tier is skipped for that trial with an integrity error recorded, rather than grading against a drifted fixture set

### Requirement: Code-quality judge with tools
The system SHALL grade code quality with an LLM judge given tool access (test runner, linter, type-checker, coverage, and the PRD text) and a fixed criterion list covering at minimum: meaningful and passing tests, architectural conformance to the spec's §3.2 abstraction layers, error-handling robustness, absence of dead/duplicated code, and documentation adequacy. Each criterion SHALL yield a 0–10 score with written justification citing evidence.

#### Scenario: Judge runs the test suite
- **WHEN** the code-quality judge grades a workspace
- **THEN** it executes the candidate's own test suite and includes the observed pass/fail/coverage results as evidence in the tests criterion score, rather than scoring from code reading alone

### Requirement: Judge independence and bias controls
Judging SHALL use a pinned judge model that is not the worker model (not Opus 4.6), temperature 0, with 3 independent samples per judgment and the median taken. Workspaces SHALL be scrubbed of framework-identifying markers (per the candidate registry's marker paths) before code-quality judging, so the judge cannot identify which framework produced the artifact. PRD-adherence functional evaluation MAY run pre-scrub.

#### Scenario: Blind code-quality judging
- **WHEN** a workspace produced by GSD (containing `.planning/`) is submitted for code-quality judging
- **THEN** the judged copy contains no `.planning/` directory or other registered framework markers, and judge prompts contain no candidate names

#### Scenario: Median of three samples
- **WHEN** three judge samples for a criterion return 6, 7, and 9
- **THEN** the recorded criterion score is 7, with all three samples retained in the grading record

### Requirement: Objective speed and token-spend scoring
Speed and token spend SHALL be scored from telemetry only (no LLM judgment): per-trial agent working time and total cost/tokens, normalized within the run matrix (best candidate mean = 100, worst = 0, linear in between), computed on per-candidate means across trials.

#### Scenario: Normalization within run
- **WHEN** candidate mean working times are 30, 45, 60, and 90 minutes
- **THEN** speed scores are 100 for 30 min, 0 for 90 min, and linearly interpolated for the others (75 and 50)

#### Scenario: Capped trial scoring
- **WHEN** a trial was terminated at its budget cap
- **THEN** its speed and token metrics are recorded at the cap values and flagged, and the report notes the candidate's metrics are right-censored

### Requirement: Weighted composite score
The system SHALL compute a composite score per candidate as a weighted sum of normalized dimension scores with configurable weights, defaulting to: PRD adherence 40%, code quality 25%, speed 17.5%, token spend 17.5%. Weights SHALL be recorded in the report, and changing weights SHALL be possible at report time without re-running trials or re-judging.

#### Scenario: Re-weighting without re-running
- **WHEN** the operator regenerates a report from an existing run with different weights
- **THEN** the new report is produced from stored per-dimension scores alone, with the new weights recorded

# harness-drivers Specification

## Purpose
TBD - created by archiving change add-pluggable-harnesses. Update Purpose after archive.
## Requirements
### Requirement: Pluggable harness driver dispatch
The system SHALL drive each harness through a per-harness driver selected by the run's
harness id, rather than hard-coding one harness. A harness driver SHALL define how to
install the harness at a pinned version in the sandbox, run a headless session against
the rendered base prompt in the workspace (with continuation only from the registry's
content-free allowlist), and parse the harness's output into the common session-record
shape (duration, tokens, cost, turns). `claude-code` SHALL be one such driver, with no
change to its existing behavior.

#### Scenario: Harness selects its driver
- **WHEN** a run is configured with a harness id that has a registered driver
- **THEN** the session executor dispatches to that driver to install and run the
  harness, and records the harness id and version in provenance

#### Scenario: Claude Code unchanged
- **WHEN** a run uses `claude-code`
- **THEN** it executes through the `claude-code` driver with identical behavior and
  telemetry to before this change

#### Scenario: Unknown harness fails fast
- **WHEN** a run references a harness id with no registered driver
- **THEN** validation fails before any sandbox is provisioned, naming the missing
  driver

### Requirement: Harness-agnostic telemetry and cost source
A harness driver SHALL normalize its harness's output into the common session record,
and the recorded cost source SHALL be `harness-reported` when the harness emits
dollars, `profile-priced` when computed from token usage and model-registry pricing,
or `tokens-only` when only token counts are available. Session output SHALL be captured
to a file and read after the process exits, so a service the harness starts cannot hold
the capture open.

#### Scenario: Non-reporting harness priced from the model registry
- **WHEN** a harness does not emit dollar cost but reports token usage
- **THEN** trial cost is computed from token usage × the worker model's pricing and
  recorded with source `profile-priced` (or `tokens-only` if no pricing)

### Requirement: Cross-harness fairness
The rendered base prompt SHALL be identical for every candidate regardless of harness.
Within a run, every candidate SHALL use the identical worker-model profile, and a run
that compares harnesses SHALL pin the same worker model across those harnesses. Results
SHALL be keyed by candidate, harness, and worker model so a harness comparison is not
conflated with a model comparison.

#### Scenario: Harness is the only variable
- **WHEN** a run evaluates the same candidate under two harnesses
- **THEN** both receive the identical base prompt and the identical pinned worker
  model, and results are grouped by (candidate, harness, worker model)

### Requirement: Judge neutrality across compared harnesses
The blind code-quality judge SHALL be a model independent of every harness/model under
comparison in a run, to avoid self-preference bias (a model rating its own family's
output more favorably). The judge model SHALL NOT be from a vendor whose harness or
worker model is being compared in that run; when no fully neutral judge is configured,
the run SHALL flag a self-preference-bias caveat in provenance and the scorecard. This
extends the existing judge≠worker rule: not only must the judge differ from the worker,
it must be neutral to all compared harnesses.

#### Scenario: Neutral judge for a cross-vendor harness comparison
- **WHEN** a run compares `gemini-cli` (Gemini) against `grok-cli` (Grok)
- **THEN** the judge is a model from neither vendor (e.g. a Claude judge), and the run
  records that the judge is neutral to both compared harnesses

#### Scenario: Self-preference risk flagged
- **WHEN** a run compares harnesses including one whose vendor matches the judge's
  vendor (e.g. a Claude judge while `claude-code` is under comparison)
- **THEN** the run flags a self-preference-bias caveat in provenance and the scorecard
  so the result is not read as bias-free


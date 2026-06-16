# Capability: harness-drivers

## ADDED Requirements

### Requirement: Cline CLI harness driver
The system SHALL provide a Cline CLI harness driver that installs a pinned Cline CLI
in the sandbox, runs a non-interactive task against the workspace, configures Cline
(bring-your-own-key) to the run's pinned worker model, and parses its output into the
common session record. Continuation at approval gates SHALL draw only from the
registry's content-free allowlist.

#### Scenario: Cline run on the pinned worker model
- **WHEN** a run is configured with harness `cline-cli` and a worker model
- **THEN** trial sessions run the Cline CLI non-interactively in the workspace on that
  model, and provenance records harness `cline-cli` with its version

#### Scenario: Eligible for fair cross-harness comparison
- **WHEN** `cline-cli` and another model-agnostic harness run the same pinned model
- **THEN** the comparison holds the model fixed and is keyed by
  (candidate, harness, worker model)

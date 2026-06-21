# Capability: harness-drivers

## ADDED Requirements

### Requirement: Codex CLI harness driver
The system SHALL provide a Codex CLI harness driver that installs a pinned Codex CLI
in the sandbox, runs a non-interactive `codex exec` session against the workspace on
a configured OpenAI model, and parses its output into the common session record.
Because the Codex CLI is restricted to OpenAI models, a run comparing it against a
harness on a different model SHALL be recorded as a harness-and-model comparison
(provenance + scorecard caveat), not a pure harness comparison. The driver SHALL
pass the shared driver-contract test suite via a Codex conformance fixture.

#### Scenario: Codex CLI headless run
- **WHEN** a run is configured with harness `codex` and an OpenAI model
- **THEN** trial sessions run the Codex CLI non-interactively (`codex exec`) in the
  workspace, and provenance records harness `codex` with its version

#### Scenario: Model-locked confound flagged
- **WHEN** a run pits `codex` (OpenAI) against `claude-code` (Claude)
- **THEN** the run is flagged as a harness+model comparison in provenance and the
  scorecard, not a pure harness comparison

#### Scenario: Driver passes the contract suite
- **WHEN** the driver-contract test suite runs against the Codex conformance fixture
- **THEN** the Codex driver's dispatch, output-by-file capture, telemetry
  normalization, and cost-source resolution are asserted to conform

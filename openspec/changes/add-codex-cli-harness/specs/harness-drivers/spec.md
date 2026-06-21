# Capability: harness-drivers

## ADDED Requirements

### Requirement: Codex CLI harness driver
The system SHALL provide a Codex CLI harness driver that installs a pinned Codex CLI
in the sandbox, runs a non-interactive `codex exec` session against the workspace,
and parses its output into the common session record. The Codex CLI is
**model-agnostic**: the driver SHALL configure Codex's model and provider from the
run's pinned worker-model profile using Codex's `model_providers` mechanism
(`base_url`, `env_key`, `wire_api`) or its built-in/`--oss` providers, so the worker
model can be held fixed across harnesses where reachable. The driver SHALL pass the
shared driver-contract test suite via a Codex conformance fixture.

#### Scenario: Codex CLI headless run on the configured model
- **WHEN** a run is configured with harness `codex` and a worker-model profile
- **THEN** trial sessions run the Codex CLI non-interactively (`codex exec`) in the
  workspace against that profile's model/provider, and provenance records harness
  `codex` with its version and the resolved provider + model

#### Scenario: Cross-model run flagged generically
- **WHEN** a run places `codex` and another harness on different worker models
- **THEN** the run is recorded as a harness+model comparison (provenance + scorecard
  caveat) under the ordinary cross-harness rule — not because Codex is model-locked

#### Scenario: Driver passes the contract suite
- **WHEN** the driver-contract test suite runs against the Codex conformance fixture
- **THEN** the Codex driver's dispatch, output-by-file capture, telemetry
  normalization, and cost-source resolution are asserted to conform

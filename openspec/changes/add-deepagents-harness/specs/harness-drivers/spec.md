# Capability: harness-drivers

## ADDED Requirements

### Requirement: Deep Agents (dcode) harness driver
The system SHALL provide a Deep Agents (`dcode`) harness driver that installs a
pinned `dcode` in the sandbox, runs a non-interactive `dcode -n` session against the
workspace, and parses its output into the common session record. `dcode` is
**model-agnostic**: the driver SHALL configure the model from the run's pinned
worker-model profile via `--model <provider>:<model>` (auth from the model registry),
so the worker model can be held fixed across harnesses. The driver SHALL pass the
shared driver-contract test suite via a `dcode` conformance fixture.

#### Scenario: Deep Agents headless run on the configured model
- **WHEN** a run is configured with harness `deepagents` and a worker-model profile
- **THEN** trial sessions run `dcode -n` non-interactively in the workspace on that
  profile's model, and provenance records harness `deepagents` with its version and
  the resolved provider + model

#### Scenario: Cross-model run flagged generically
- **WHEN** a run places `deepagents` and another harness on different worker models
- **THEN** the run is recorded as a harness+model comparison (provenance + scorecard
  caveat) under the ordinary cross-harness rule — not because deepagents is
  model-locked

#### Scenario: Driver passes the contract suite
- **WHEN** the driver-contract test suite runs against the `dcode` conformance fixture
- **THEN** the deepagents driver's dispatch, output-by-file capture, telemetry
  normalization, and cost-source resolution are asserted to conform

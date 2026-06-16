# Capability: harness-drivers

## ADDED Requirements

### Requirement: Goose harness driver
The system SHALL provide a Goose harness driver that installs a pinned Goose CLI in
the sandbox, runs a headless `goose run` session against the rendered base prompt in
the workspace, configures Goose non-interactively to the run's pinned worker model,
and parses Goose's output into the common session record. Continuation at approval
gates SHALL use Goose session resume and SHALL draw only from the registry's
content-free continuation allowlist.

#### Scenario: Goose run on the pinned worker model
- **WHEN** a run is configured with harness `goose` and a worker model
- **THEN** trial sessions run `goose run` non-interactively in the workspace against
  that model, and provenance records harness `goose` with its version

#### Scenario: Goose cost basis recorded
- **WHEN** a Goose trial completes and Goose does not emit dollar cost
- **THEN** trial cost is computed from token usage and the worker model's pricing
  (`profile-priced`), or recorded as `tokens-only`, and surfaced as a cost-basis
  caveat in the scorecard

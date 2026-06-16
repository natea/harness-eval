# Capability: harness-drivers

## ADDED Requirements

### Requirement: Grok CLI harness driver
The system SHALL provide a Grok CLI harness driver that installs a pinned Grok CLI in
the sandbox, runs a non-interactive prompt session against the workspace on a
configured Grok (xAI) model, and parses its output into the common session record.
Because the Grok CLI is restricted to Grok models, a run comparing it against a
harness on a different model SHALL be recorded as a harness-and-model comparison
(provenance + scorecard caveat), not a pure harness comparison.

#### Scenario: Grok CLI headless run
- **WHEN** a run is configured with harness `grok-cli` and a Grok model
- **THEN** trial sessions run the Grok CLI non-interactively in the workspace, and
  provenance records harness `grok-cli` with its version

#### Scenario: Model-locked confound flagged
- **WHEN** a run pits `grok-cli` (Grok) against `claude-code` (Claude)
- **THEN** the run is flagged as a harness+model comparison in provenance and the
  scorecard

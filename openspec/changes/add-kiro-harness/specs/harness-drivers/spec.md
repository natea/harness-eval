# Capability: harness-drivers

## ADDED Requirements

### Requirement: Kiro CLI harness driver
The system SHALL provide a Kiro CLI harness driver that executes one
non-interactive `kiro-cli chat --output-format stream-json` session per step
against the rendered base prompt, configures the run's worker model and
`KIRO_API_KEY` from the model registry, and parses the event stream into the
common session record. Gate continuation SHALL reuse the session via
`--resume-id` using only the registry's content-free continuation allowlist.

#### Scenario: Kiro headless run
- **WHEN** a run is configured with harness `kiro` and a worker model
- **THEN** trial sessions run `kiro-cli chat --no-interactive --trust-all-tools
  --output-format stream-json` in the workspace, and provenance records harness
  `kiro` with its version

#### Scenario: Kiro cost basis recorded
- **WHEN** a Kiro trial completes and Kiro reports metering credits rather than
  dollars
- **THEN** trial cost is computed from token usage and the worker model's pricing
  (`profile-priced`), or recorded as `tokens-only`, and surfaced as a cost-basis
  caveat in the scorecard

#### Scenario: Harness-model confound flagged
- **WHEN** a run pits `kiro` against a harness on a different model
- **THEN** the run is flagged as a harness+model comparison in provenance and the
  scorecard, not a pure harness comparison

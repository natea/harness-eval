# Capability: harness-drivers

## ADDED Requirements

### Requirement: Gemini CLI harness driver
The system SHALL provide a Gemini CLI harness driver that installs a pinned
`@google/gemini-cli` in the sandbox, runs a non-interactive `gemini -p <prompt>`
session against the workspace on a configured Gemini model, and parses its output
into the common session record. Because the Gemini CLI is restricted to Gemini
models, a run comparing it against a harness on a different model SHALL be recorded
as a harness-and-model comparison (provenance + scorecard caveat), not a pure
harness comparison.

#### Scenario: Gemini CLI headless run
- **WHEN** a run is configured with harness `gemini-cli` and a Gemini model
- **THEN** trial sessions run `gemini -p` non-interactively in the workspace, and
  provenance records harness `gemini-cli` with its version

#### Scenario: Model-locked confound flagged
- **WHEN** a run pits `gemini-cli` (Gemini) against `claude-code` (Claude)
- **THEN** the run is flagged as a harness+model comparison in provenance and the
  scorecard, so it is not mistaken for a pure harness comparison

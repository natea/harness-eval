# Capability: harness-drivers

## ADDED Requirements

### Requirement: Cursor CLI harness driver
The system SHALL provide a Cursor CLI harness driver that installs a pinned
`cursor-agent` in the sandbox, runs a non-interactive print session
(`cursor-agent -p <prompt> --output-format json`) against the workspace on a selected
model, and parses its output into the common session record. Because Cursor executes
through its own backend and account, a run using `cursor-cli` SHALL record a
routing/account caveat in provenance and the scorecard, and a "matching" worker-model
id SHALL be treated as approximate rather than identical to direct provider access.

#### Scenario: Cursor CLI headless run
- **WHEN** a run is configured with harness `cursor-cli` and a selected model
- **THEN** trial sessions run `cursor-agent -p --output-format json` in the workspace,
  and provenance records harness `cursor-cli` with its version

#### Scenario: Routing/account caveat flagged
- **WHEN** a run uses `cursor-cli` against a model id shared with another harness
- **THEN** the run records the Cursor routing/account caveat, so the comparison is not
  reported as an identical-model head-to-head

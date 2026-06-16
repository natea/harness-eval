# Capability: harness-drivers

## ADDED Requirements

### Requirement: OpenHands harness driver
The system SHALL provide an OpenHands harness driver that installs a pinned
`openhands-ai` in the sandbox, runs a headless one-shot task
(`openhands --headless -t <prompt> --json`) against the workspace, configures the LLM
to the run's pinned worker model, and parses the JSON agent-event stream into the
common session record (turns, tokens, cost). Headless mode runs auto-approved;
continuation, when used, SHALL draw only from the registry's content-free allowlist.

#### Scenario: OpenHands headless run on the pinned worker model
- **WHEN** a run is configured with harness `openhands` and a worker model
- **THEN** trial sessions run `openhands --headless --json` in the workspace against
  that model, and provenance records harness `openhands` with its version

#### Scenario: Telemetry from the event stream
- **WHEN** an OpenHands trial completes
- **THEN** turns and token/cost usage are parsed from the `--json` event stream into
  the session record, with the cost source recorded (`harness-reported` /
  `profile-priced` / `tokens-only`)

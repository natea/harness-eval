# Capability: harness-drivers

## ADDED Requirements

### Requirement: Qwen Code harness driver
The system SHALL provide a Qwen Code harness driver that executes one
non-interactive `qwen -p --output-format stream-json` session per step against
the rendered base prompt, configures an OpenAI-compatible endpoint and model from
the model registry, and parses the stream-json events into the common session
record. Gate continuation SHALL reuse the session via `--resume` using only the
registry's content-free continuation allowlist.

#### Scenario: Qwen Code headless run
- **WHEN** a run is configured with harness `qwen-code` and a worker model
- **THEN** trial sessions run `qwen -p --output-format stream-json --yolo`
  non-interactively in the workspace, and provenance records harness `qwen-code`
  with its version

#### Scenario: Qwen Code cost basis recorded
- **WHEN** a Qwen Code trial completes and Qwen Code emits tokens but no dollars
- **THEN** trial cost is computed from token usage and the worker model's pricing
  (`profile-priced`), or recorded as `tokens-only`, and surfaced as a cost-basis
  caveat in the scorecard

#### Scenario: Harness-model confound flagged
- **WHEN** a run pits `qwen-code` (Qwen models) against a Claude-model harness
- **THEN** the run is flagged as a harness+model comparison in provenance and the
  scorecard, not a pure harness comparison

# run-telemetry Specification

## Purpose
TBD - created by archiving change setup-harness-eval-framework. Update Purpose after archive.
## Requirements
### Requirement: Session metrics capture
The system SHALL capture, from each headless harness session's JSON output, at minimum: wall-clock duration, input tokens, output tokens, cache-read and cache-creation tokens, turn count, and cost. Cost SHALL be taken from the harness when natively reported; otherwise computed from token usage and the worker model profile's pricing; otherwise recorded as tokens-only. The cost source SHALL be recorded per trial, and per-trial aggregation SHALL sum sessions as today.

#### Scenario: Harness-reported cost (Anthropic billing)
- **WHEN** a trial runs on a native Anthropic profile
- **THEN** trial cost sums the sessions' harness-reported `total_cost_usd` with source `harness-reported`

#### Scenario: Profile-priced cost (third-party endpoint)
- **WHEN** a trial runs on a profile whose harness reports zero/no cost but declares pricing
- **THEN** trial cost is computed from summed token usage at the profile's rates with source `profile-priced`

#### Scenario: Tokens-only fallback
- **WHEN** a profile has no pricing and the harness reports no cost
- **THEN** the trial records cost as null with source `tokens-only`, and the run's token-spend dimension uses token counts for every candidate in that run

### Requirement: Speed measurement boundaries
Speed of execution SHALL be measured as agent working time: the sum of session durations from first prompt submission to final result per session. Sandbox provisioning, framework installation, and grading time MUST be recorded separately and MUST NOT count toward the speed dimension.

#### Scenario: Setup excluded from speed
- **WHEN** a trial spends 4 minutes provisioning and installing and 38 minutes in agent sessions
- **THEN** the speed metric for the trial is 38 minutes, and the 4 minutes appear under setup time in the trial record

### Requirement: Artifact archival
The system SHALL archive per trial: the final workspace (the built codebase), all session transcripts (stream-JSON), telemetry records, and the trial provenance record, under `runs/<run-id>/trials/<trial-id>/`, before the trial's sandbox is destroyed.

#### Scenario: Archive before teardown
- **WHEN** a Daytona trial reaches any terminal status (completed, capped, infra-failed)
- **THEN** workspace and transcripts are copied out of the sandbox to the run directory before sandbox destruction, and the archive is sufficient to re-grade the trial without re-running it

### Requirement: Secret hygiene in archives
The system SHALL scan transcripts and archived workspaces for known secret patterns (including `DAYTONA_API_KEY` and `ANTHROPIC_API_KEY` values present in the orchestrator environment) and SHALL redact any matches before the archive is written.

#### Scenario: Leaked key redacted
- **WHEN** a session transcript contains the literal value of an API key from the orchestrator environment
- **THEN** the archived transcript contains a redaction placeholder instead of the key value, and the redaction event is logged


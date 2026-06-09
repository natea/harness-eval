# Capability: run-telemetry

## ADDED Requirements

### Requirement: Session metrics capture
The system SHALL capture, from each headless Claude Code session's JSON output, at minimum: wall-clock duration, input tokens, output tokens, cache-read and cache-creation tokens, reported cost in USD, and turn count; and SHALL aggregate these per trial across all sessions in the trial's session script.

#### Scenario: Single-session trial metrics
- **WHEN** a Superpowers trial completes its one session
- **THEN** the trial telemetry record contains that session's duration, token breakdown, cost, and turn count, and trial totals equal the session values

#### Scenario: Multi-session trial aggregation
- **WHEN** a GSD trial completes five sessions
- **THEN** trial totals are the sums across all five sessions, and per-session records are retained individually

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

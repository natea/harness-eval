# Delta: run-telemetry — generalized cost capture

## MODIFIED Requirements

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

# Capability: harness-drivers

## ADDED Requirements

### Requirement: OpenCode harness driver
The system SHALL provide an OpenCode harness driver that executes one
non-interactive `opencode run --format json` session per step against the
rendered base prompt, configures the run's worker model as a models.dev
`provider/model` id, injects the profile's credential via its `authEnv`, and
parses the NDJSON events into the common session record. Gate continuation SHALL
reuse the session via `--session` using only the registry's content-free
allowlist.

#### Scenario: OpenCode headless run
- **WHEN** a run is configured with harness `opencode` and a worker model
- **THEN** trial sessions run `opencode run --format json --auto` non-interactively
  in the workspace, and provenance records harness `opencode` with its version

#### Scenario: OpenCode telemetry and cost basis recorded
- **WHEN** an OpenCode trial completes
- **THEN** each `step_finish` event contributes a turn, its models.dev-priced USD
  `cost`, and its input/output/cache token counts to the session record, and the
  run's cost source is recorded as harness-reported (native Anthropic) or
  profile-priced/tokens-only otherwise

#### Scenario: OpenCode requires an image-backed provider
- **WHEN** a run selects harness `opencode` on the `worktree` provider
- **THEN** the run fails before dispatch, because the host has no pinned OpenCode
  CLI

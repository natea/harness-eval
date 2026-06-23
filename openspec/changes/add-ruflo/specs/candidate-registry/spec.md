# Spec Delta: candidate-registry — Ruflo

## ADDED Requirements

### Requirement: Ruflo framework candidate
The candidate registry SHALL include **Ruflo** (`ruvnet/ruflo`) as a `claude-code` candidate, registered via Ruflo's plugin (Lite) path — slash commands only, no MCP server. Its install steps SHALL provision the pinned Ruflo plugin and assert the pinned version so upstream drift fails the trial deterministically. Its session script SHALL consist solely of Ruflo's prescribed orchestration command wrappers, with the shared base prompt injected once — no task hints beyond the identical rendered base prompt. Ruflo's identifying paths SHALL be recorded as marker paths so they are scrubbed before blind judging.

#### Scenario: Ruflo is registered and conformant
- **WHEN** the registry is validated
- **THEN** the `ruflo` candidate is present with a pinned version, install steps that add the Ruflo plugin and assert that version, and a session script of Ruflo command wrappers carrying the identical base prompt

#### Scenario: Pinned version drift fails deterministically
- **WHEN** the installed Ruflo plugin version does not match the pinned version
- **THEN** the install-time assertion fails and the trial does not proceed, rather than silently running a different version

#### Scenario: Marker paths scrubbed before blind judging
- **WHEN** a Ruflo trial's workspace is prepared for the blind code-quality judge
- **THEN** Ruflo's identifying paths (e.g. `.claude-flow/`, `.claude/`, `CLAUDE.md`) are scrubbed so the framework is not identifiable from the artifact

### Requirement: Meta-harness candidates stay single-model and isolated
A candidate that is an agent meta-harness (orchestration, swarms, routing, persistent memory, or federation — e.g. Ruflo) SHALL run within the eval's invariants: it SHALL use only the run's pinned worker model (no routing to other providers), SHALL NOT carry state between trials (no cross-trial persistent memory or self-learning), and SHALL NOT reach outside its trial sandbox (no cross-machine federation or external services). A candidate mode that cannot honor these SHALL NOT be run-eligible until a scoped change proves it.

#### Scenario: Single worker model enforced
- **WHEN** a meta-harness candidate runs a trial
- **THEN** its telemetry shows calls only to the run's pinned worker model, with no off-model (other-provider) calls

#### Scenario: No cross-trial contamination or external reach
- **WHEN** a meta-harness candidate runs successive trials
- **THEN** each trial starts from fresh sandbox state with no memory carried from a prior trial, and no federation or external store is contacted from inside the sandbox

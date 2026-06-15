# Spec Delta: candidate-registry — Spec-Kitty

## ADDED Requirements

### Requirement: Spec-Kitty framework candidate
The candidate registry SHALL include **Spec-Kitty** (Priivacy-ai/spec-kitty) as a `claude-code` candidate. Its install steps SHALL provision the pinned `spec-kitty` CLI and initialize its charter + Claude Code host commands into the trial workspace, and SHALL assert the pinned version so upstream drift fails the trial deterministically. Its session script SHALL consist solely of Spec-Kitty's prescribed mission/charter command wrappers, with the shared base prompt injected once as the mission definition — no task hints beyond the identical rendered base prompt. Spec-Kitty's identifying paths SHALL be recorded as marker paths so they are scrubbed before blind judging.

#### Scenario: Spec-Kitty is registered and conformant
- **WHEN** the registry is validated
- **THEN** the `spec-kitty` candidate is present with a pinned version, install steps that bootstrap the `spec-kitty` CLI and assert that version, and a session script of mission/charter wrappers carrying the identical base prompt

#### Scenario: Pinned version drift fails deterministically
- **WHEN** the installed `spec-kitty` CLI version does not match the pinned version
- **THEN** the install-time assertion fails and the trial does not proceed, rather than silently running a different version

#### Scenario: Marker paths scrubbed before blind judging
- **WHEN** a Spec-Kitty trial's workspace is prepared for the blind code-quality judge
- **THEN** Spec-Kitty's identifying paths (e.g. `.kittify/`) are scrubbed so the framework is not identifiable from the artifact

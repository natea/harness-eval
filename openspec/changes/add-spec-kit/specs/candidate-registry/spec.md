# Spec Delta: candidate-registry — Spec-Kit

## ADDED Requirements

### Requirement: Spec-Kit framework candidate
The candidate registry SHALL include **Spec-Kit** (GitHub's spec-driven development toolkit) as a `claude-code` candidate. Its install steps SHALL provision the pinned `specify` CLI and initialize Spec-Kit's project-local commands into the trial workspace, and SHALL assert the pinned version so upstream drift fails the trial deterministically. Its session script SHALL consist solely of Spec-Kit's prescribed `/speckit.*` command wrappers, with the shared base prompt injected once as the specification input — no task hints beyond the identical rendered base prompt. Spec-Kit's identifying paths SHALL be recorded as marker paths so they are scrubbed before blind judging.

#### Scenario: Spec-Kit is registered and conformant
- **WHEN** the registry is validated
- **THEN** the `spec-kit` candidate is present with a pinned version, install steps that bootstrap the `specify` CLI and assert that version, and a session script of `/speckit.*` wrappers carrying the identical base prompt

#### Scenario: Pinned version drift fails deterministically
- **WHEN** the installed `specify` CLI version does not match the pinned version
- **THEN** the install-time assertion fails and the trial does not proceed, rather than silently running a different version

#### Scenario: Marker paths scrubbed before blind judging
- **WHEN** a Spec-Kit trial's workspace is prepared for the blind code-quality judge
- **THEN** Spec-Kit's identifying paths (e.g. `.specify/`, `specs/`) are scrubbed so the framework is not identifiable from the artifact

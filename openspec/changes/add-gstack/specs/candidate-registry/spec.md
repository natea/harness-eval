# Spec Delta: candidate-registry — gstack

## ADDED Requirements

### Requirement: gstack framework candidate
The candidate registry SHALL include **gstack** (`garrytan/gstack`) as a `claude-code` candidate, installed via its skills-dir clone + `./setup` checked out at a pinned commit (the repo has no release tags). Its install steps SHALL provision the pinned gstack skills and assert the pin so upstream drift fails the trial deterministically. Its session script SHALL be gstack's graded-build flow (plan → implement → review) with the shared base prompt injected once and no task hints beyond the identical rendered base prompt. gstack's identifying paths SHALL be recorded as marker paths so they are scrubbed before blind judging.

#### Scenario: gstack is registered and conformant
- **WHEN** the registry is validated
- **THEN** the `gstack` candidate is present with a pinned commit, install steps that clone+setup gstack at that commit and assert it, and a session script of gstack's plan/build/review commands carrying the identical base prompt

#### Scenario: Pinned commit drift fails deterministically
- **WHEN** the installed gstack commit does not match the pin
- **THEN** the install-time assertion fails and the trial does not proceed, rather than silently running a different version

#### Scenario: Marker paths scrubbed before blind judging
- **WHEN** a gstack trial's workspace is prepared for the blind code-quality judge
- **THEN** gstack's identifying paths (e.g. `.claude/skills/gstack/`, `CLAUDE.md`, `AGENTS.md`) are scrubbed so the framework is not identifiable from the artifact

### Requirement: gstack runs without external or deploy capabilities
gstack ships browser (`/browse`, `connect-chrome`), deploy (`/ship`, `/land-and-deploy`, `/canary`), and an opt-in memory ("gbrain") capability. As a candidate it SHALL run within the eval's invariants: only the run's pinned worker model, no cross-trial state (gbrain off, fresh sandbox per trial, no external store), and no external reach — its session SHALL NOT exercise browser or deploy commands, and the trial SHALL surface any external/Chrome/deploy/brain activity rather than counting it.

#### Scenario: Build flow excludes deploy and browser
- **WHEN** a gstack trial runs its session
- **THEN** the session performs gstack's plan/build/review steps and does not invoke `/ship`, `/land-and-deploy`, `/browse`, or `connect-chrome`

#### Scenario: Single model, no external reach
- **WHEN** a gstack trial completes
- **THEN** its telemetry shows calls only to the run's pinned worker model, and no external/federation/brain store was contacted from inside the sandbox

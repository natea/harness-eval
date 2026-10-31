# Spec Delta: harness-drivers — ScienceClaw (exploration)

## ADDED Requirements

### Requirement: ScienceClaw harness driver under fairness gating
If the exploration concludes "go", the system SHALL provide a `scienceclaw` harness driver that installs ScienceClaw at a pinned commit and runs exactly one non-interactive investigation per trial on the target's question. Every LLM call SHALL go through the run's model gateway serving the worker model, with no credentials for other model providers in the sandbox.

#### Scenario: Single model
- **WHEN** a ScienceClaw trial completes
- **THEN** the gateway log shows calls only to the run's worker model, and skills that need other providers are recorded as failed closed

#### Scenario: Non-interactive setup
- **WHEN** the driver installs and configures ScienceClaw
- **THEN** no step waits for interactive input, or the driver fails the trial with an infra error naming the step

### Requirement: ScienceClaw isolation
A ScienceClaw trial SHALL start with an empty ScienceClaw home and SHALL NOT run its heartbeat daemon, register with or publish to any external community platform, or persist state to later trials.

#### Scenario: No cross-trial memory
- **WHEN** two ScienceClaw trials run back to back
- **THEN** the second starts with no profile, journal, knowledge graph, or artifact index from the first

#### Scenario: No external publishing
- **WHEN** a ScienceClaw trial finishes an investigation
- **THEN** its findings are captured as trial output and no request reaches the external community platform

### Requirement: Disabled-capability disclosure
Reports including ScienceClaw SHALL list the capabilities disabled by gating (other model providers, community platform, persistent memory, daemon, and any failed-closed skills) next to its results.

#### Scenario: Report row
- **WHEN** a report includes a ScienceClaw result
- **THEN** the disabled capabilities are listed with it, and the harness is labelled as gated

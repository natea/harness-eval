# Spec Delta: candidate-registry — BioNeMo Agent Toolkit

## ADDED Requirements

### Requirement: BioNeMo Agent Toolkit candidate
The candidate registry SHALL include `bionemo-agent-toolkit` (`NVIDIA-BioNeMo/bionemo-agent-toolkit`) as a `claude-code` candidate. It SHALL be installed by cloning the repository at a pinned commit and copying a declared subset of its skills into the trial's skills directory. The install SHALL assert the pinned commit. The session script SHALL be the shared base prompt with no task hints.

#### Scenario: Pinned install
- **WHEN** the candidate is installed in a trial
- **THEN** only the declared skill subset is present and the install fails if the checked-out commit differs from the pin

#### Scenario: GPU skills excluded
- **WHEN** the installed skills are listed
- **THEN** none of the declared local-GPU or Docker skills are present

### Requirement: Identical science egress across candidates
A run that includes the BioNeMo candidate SHALL apply one egress allowlist and one key policy (an NVIDIA API key present or absent) identically to every candidate in that run, and SHALL record the policy in run provenance.

#### Scenario: Key parity
- **WHEN** a run provides `NGC_API_KEY`
- **THEN** every candidate's sandbox receives the same key and egress allowlist, and provenance records it

#### Scenario: No-key control
- **WHEN** a run provides no NVIDIA API key
- **THEN** the BioNeMo candidate runs with its skills installed and hosted calls failing, and provenance marks the run as a no-key control

### Requirement: Headless-safe skill prompts
The BioNeMo candidate's sessions SHALL NOT block on interactive questions. Skill questions SHALL be answered from the run's fixed policy or SHALL fail the turn immediately.

#### Scenario: Skill asks hosted vs local
- **WHEN** a skill asks whether to use the hosted API or a local container
- **THEN** the run's fixed policy answers it, or the turn fails fast with a recorded reason, and the trial never waits for its timeout

### Requirement: External model calls attributed
Trials of the BioNeMo candidate SHALL record each hosted model call (endpoint, status, latency). A trial whose hosted calls fail on the provider side SHALL be marked `infra-error`, not scored as a candidate failure.

#### Scenario: Provider outage
- **WHEN** the hosted endpoint times out for every call in a trial
- **THEN** the trial is marked `infra-error` with the failing calls listed, and it is excluded from candidate scoring

# Capability: forkd-provider

## ADDED Requirements

### Requirement: forkd as a SandboxProvider
The harness SHALL be able to run a trial through a `forkd` isolation provider
that implements the `SandboxProvider` contract (provision, write file, read
file, exec, teardown), provisioning each trial as a copy-on-write child forked
from a warmed parent microVM rather than a cold boot. Provenance SHALL record
`provider: forkd`, the pinned forkd version, and the warmed-image identity.

#### Scenario: Trial runs on a forkd child
- **WHEN** a run selects `--provider forkd` with a warmed parent available
- **THEN** each trial is provisioned as a CoW child, the agent session runs to a terminal state, and provenance records the forkd provider, version, and warmed-image identity

### Requirement: Warm parent excludes secrets
The warmed parent snapshot SHALL contain only the pinned trial image and
toolchains, never run-time secrets. Worker credentials SHALL be injected into
each child at provision time, never baked into the parent snapshot.

#### Scenario: Auth injected per child, not in the snapshot
- **WHEN** the parent is warmed and a child is forked for a trial
- **THEN** the worker auth token is present in the child's environment but absent from the parent snapshot and any cached snapshot artifact

### Requirement: Per-child cleanliness verified
A forkd child SHALL be a fair, isolated trial environment: its own network
namespace, fresh entropy, and no visibility into another child's files or
processes. The exploration SHALL verify non-contamination before trusting any
measured results.

#### Scenario: Two children are mutually isolated
- **WHEN** two trials run as concurrent CoW children of the same parent
- **THEN** neither can observe the other's filesystem writes or processes, and each has an independent network namespace and entropy source

### Requirement: Host preflight before spend
The forkd provider SHALL preflight before dispatching any trial and fail fast
when the host is not Linux with KVM (kernel ≥5.7, `/dev/kvm` present), the forkd
daemon is unreachable, or the warmed parent snapshot is absent.

#### Scenario: Missing KVM refuses the run
- **WHEN** a forkd run is started on a host without `/dev/kvm` or with an unreachable daemon
- **THEN** the run is refused at preflight with a clear reason and no trial is dispatched

### Requirement: Measured provisioning comparison
The exploration SHALL record per-trial provisioning time and cost for forkd and
compare them to at least one existing provider (Daytona or E2B) on the same
trial image, and SHALL produce a go/no-go recommendation covering maturity,
self-host topology, and where forkd wins.

#### Scenario: Provisioning win quantified
- **WHEN** the spike completes one real trial on forkd and one on an existing provider
- **THEN** the recommendation reports measured provision time and cost for each and a go/no-go with rationale

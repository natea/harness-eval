# Capability: swe-rex-provider

## ADDED Requirements

### Requirement: SWE-ReX as a SandboxProvider
The harness SHALL be able to run a trial through a SWE-ReX-backed isolation provider
that implements the `SandboxProvider` contract (provision, write file, exec with
exit code, copy out, teardown), driving SWE-ReX's runtime API over HTTP from the
Bun/TS orchestrator. Provenance SHALL record `provider: swe-rex`, the pinned SWE-ReX
version, and the concrete backend used (local / docker / fargate / ec2 / modal).

#### Scenario: Trial runs through SWE-ReX
- **WHEN** a run selects the SWE-ReX provider on a reachable backend
- **THEN** the trial provisions a sandbox, runs the cold-start contract and a harness
  session to a terminal state, and provenance records `swe-rex`, its version, and the
  backend

### Requirement: Per-sandbox secret injection
Worker/harness credentials SHALL be injected into each SWE-ReX sandbox at provision
time and SHALL NOT be baked into any shared image, template, or snapshot. The
exploration SHALL confirm secrets are scoped to the sandbox and cleaned up on
teardown.

#### Scenario: Auth scoped to the sandbox
- **WHEN** a SWE-ReX sandbox is provisioned for a trial
- **THEN** the worker credential is present in that sandbox's environment but not in
  any shared image/template, and is gone after teardown

### Requirement: Measured parallelism and go/no-go
The exploration SHALL measure provisioning time and concurrent-sandbox throughput on
at least one backend and compare against an existing provider (e2b or daytona), and
SHALL conclude with a go/no-go recommendation naming which backend(s) adoption would
unlock and the integration cost.

#### Scenario: Evidence-backed recommendation
- **WHEN** the exploration completes
- **THEN** it reports measured provisioning/parallelism (and the TS↔Python HTTP
  boundary cost) alongside a clear adopt / do-not-adopt recommendation

# Spec Delta: crabbox-provider

## ADDED Requirements

### Requirement: Crabbox as a SandboxProvider over the CLI
The system SHALL be able to run trials on Crabbox through the standard `SandboxProvider` interface by driving the `crabbox` CLI: leasing a fresh brokered machine, staging the spec and harness files onto it, executing build commands over the lease, collecting artifacts, and releasing the machine. The provider SHALL authenticate with a Crabbox bearer token supplied via the environment (never committed), and SHALL never depend on an SDK the tool does not provide.

#### Scenario: Run a trial on Crabbox end to end
- **WHEN** a trial is dispatched on the Crabbox provider
- **THEN** the provider leases a fresh machine, syncs the staged workspace onto it, runs the build via `crabbox run`, collects any artifacts, and releases the machine afterward — through the same `SandboxProvider` calls (`provision`/`writeFile`/`exec`/`copyOut`/`destroy`) every other provider uses

### Requirement: Strict per-trial isolation with release-destroys-the-box
Each Crabbox trial SHALL run on its own freshly leased machine with no warm reuse (no `crabbox warmup`, no shared `--id` across trials), and `destroy` SHALL release the lease such that the underlying machine is terminated and leaves no residue. The single injected worker credential SHALL be the only secret present, secrets on the host (e.g. `.env`) SHALL never be included in the synced files, and archived transcripts SHALL remain subject to the existing redaction.

#### Scenario: Successive trials share no state
- **WHEN** two trials run on Crabbox one after another
- **THEN** the second is dispatched on a fresh lease with nothing carried from the first, and the released machine from the first leaves no residue

#### Scenario: Host secrets are never synced
- **WHEN** the provider stages files for a trial
- **THEN** only the minimal spec and harness workspace is synced and host secret files are excluded, so no local secret is rsync'd to the leased machine

### Requirement: Preflight before spend
Before any Crabbox trial dispatches, the system SHALL verify the Crabbox bearer token and `crabbox` CLI are present and that a leased runner can satisfy the required harness toolchain (the provider's `requiredProbe`), failing fast if any is missing rather than spending on a lease that cannot run the build.

#### Scenario: Missing credential, CLI, or toolchain fails preflight
- **WHEN** the Crabbox token or CLI is absent, or a probe lease lacks the harness toolchain
- **THEN** preflight fails before any billable trial lease is taken

### Requirement: Setup model assessed (exploration)
The exploration SHALL document Crabbox's setup modes — brokered (coordinator plus cloud provider credentials) versus direct-SSH (no coordinator) versus delegated (wrapping an existing sandbox provider) — and recommend which mode, if any, is appropriate for the harness, including the trial-image or cloud-init hydration path needed to carry the toolchain.

#### Scenario: A concrete setup recommendation is recorded
- **WHEN** the exploration evaluates how to run Crabbox
- **THEN** it records which mode was used for the spike, what infrastructure and credentials it required, and how the harness toolchain was made present on a leased runner

### Requirement: Measured comparison recorded (exploration)
The exploration SHALL record a measured comparison of Crabbox against the existing providers — lease-to-ready latency, per-trial cost on a real backend, and concurrency headroom — so the go/no-go is evidence-based rather than asserted, and SHALL treat the isolation proof as the pass/fail gate.

#### Scenario: Latency, cost, and isolation are measured, not assumed
- **WHEN** the exploration evaluates Crabbox
- **THEN** it reports observed lease-to-ready latency, per-trial cost, and concurrency against daytona/e2b on the same target, and states explicitly whether strict per-trial isolation was demonstrated

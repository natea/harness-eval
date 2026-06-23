# Spec Delta: blaxel-provider

## ADDED Requirements

### Requirement: Blaxel as a SandboxProvider
The system SHALL be able to run trials on Blaxel through the standard `SandboxProvider` interface: provisioning a per-trial microVM, writing files into it, executing build commands, and destroying it. Provisioning SHALL use a trial image that carries the harness toolchain, and the provider SHALL authenticate with a Blaxel credential supplied via the environment (never committed).

#### Scenario: Run a trial on Blaxel end to end
- **WHEN** a trial is dispatched on the Blaxel provider
- **THEN** the provider creates a microVM from the trial image, writes the spec and harness files in, runs the build, and destroys the microVM afterward — through the same `SandboxProvider` calls every other provider uses

### Requirement: Image preflight before spend
Before any Blaxel trial dispatches, the system SHALL verify the Blaxel credential is present and that the selected trial image contains the required harness toolchain (the provider's `requiredProbe`), failing fast if either is missing rather than spending on a sandbox that cannot run the build.

#### Scenario: Stale or incomplete image fails preflight
- **WHEN** the configured Blaxel image is missing the harness toolchain (or no credential is set)
- **THEN** preflight fails before any microVM is provisioned

### Requirement: Per-trial isolation and clean teardown
Each Blaxel trial SHALL run in its own microVM with state isolated from other trials, and destroying it SHALL leave no residue (root filesystem wiped). The single injected worker credential SHALL be the only secret in the sandbox, and archived transcripts SHALL remain subject to the existing redaction.

#### Scenario: Successive trials share no state
- **WHEN** two trials run on Blaxel one after another
- **THEN** the second starts from fresh image state with nothing carried from the first, and each destroyed microVM leaves no residue

### Requirement: Measured comparison recorded (exploration)
The exploration SHALL record a measured comparison of Blaxel against the existing providers — cold-create vs warm snapshot-resume provisioning latency, per-trial cost, and concurrency headroom — so the go/no-go is evidence-based rather than asserted.

#### Scenario: Provisioning and cost are measured, not assumed
- **WHEN** the exploration evaluates Blaxel
- **THEN** it reports observed provisioning latency (cold and warm), per-trial cost, and concurrency against daytona/e2b on the same target

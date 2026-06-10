# Delta: eval-orchestration — macOS virtualization provider

## MODIFIED Requirements

### Requirement: Trial isolation
Each trial SHALL execute in a freshly provisioned isolated environment with no state shared between trials. The orchestrator SHALL support five isolation providers behind one interface: Daytona sandboxes (cloud, primary), E2B sandboxes (cloud, alternative), Docker containers (local), macOS virtualization via Apple's Containerization `container` CLI (local, Apple Silicon only), and git worktrees with a per-trial `CLAUDE_CONFIG_DIR` (zero-dependency fallback). All container/sandbox/VM providers MUST run the same pinned trial-environment image definition and MUST perform preflight validation before any trial is dispatched.

#### Scenario: macOS VM trial provisioning
- **WHEN** a trial starts with the macos-vz provider on an Apple Silicon Mac with the `container` CLI at or above the pinned minimum version and the trial image present
- **THEN** the orchestrator boots a fresh per-trial lightweight VM with configured memory/CPU limits, installs the candidate framework, runs the trial, archives artifacts, and removes the VM

#### Scenario: macOS preflight platform gate
- **WHEN** a run requests the macos-vz provider on a non-Apple-Silicon host, or the `container` CLI is missing or below the pinned minimum version
- **THEN** the run fails at preflight naming the unmet requirement and remediation, and no trial is dispatched

#### Scenario: Cross-trial contamination check
- **WHEN** two trials of different candidates run concurrently on any provider
- **THEN** neither trial's workspace, plugin set, skills directory, or npm global state is observable from the other trial's environment

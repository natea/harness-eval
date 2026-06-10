# Delta: eval-orchestration — E2B provider

## MODIFIED Requirements

### Requirement: Trial isolation
Each trial SHALL execute in a freshly provisioned isolated environment with no state shared between trials. The orchestrator SHALL support three isolation providers behind one interface: Daytona sandboxes (cloud, primary), E2B sandboxes (cloud, alternative), and local git worktrees with a per-trial `CLAUDE_CONFIG_DIR` (fallback). Providers MUST perform preflight validation before any trial is dispatched: the pinned snapshot/template exists, and provider lifetime/resource policies admit the configured per-trial wall-clock budget.

#### Scenario: Daytona trial provisioning
- **WHEN** a trial starts with the Daytona provider configured and `DAYTONA_API_KEY` present in the environment
- **THEN** the orchestrator creates a fresh sandbox from the pinned snapshot, installs the candidate framework per its registry definition, runs the trial, archives artifacts, and destroys the sandbox

#### Scenario: E2B trial provisioning
- **WHEN** a trial starts with the E2B provider configured and `E2B_API_KEY` present in the environment
- **THEN** the orchestrator creates a fresh sandbox from the pinned E2B template with a lifetime covering the trial wall-clock budget, extends the lifetime between session steps, installs the candidate framework, runs the trial, archives artifacts, and kills the sandbox

#### Scenario: E2B preflight lifetime validation
- **WHEN** a run requests the E2B provider and the account tier's maximum sandbox lifetime is less than the configured per-trial wall-clock budget
- **THEN** the run fails at preflight with an error naming the tier cap and the configured budget, and no sandbox is created

#### Scenario: Worktree fallback isolation
- **WHEN** a trial runs with the worktree provider
- **THEN** the trial executes in a dedicated worktree under `runs/<run-id>/trials/<trial-id>/` with a dedicated `CLAUDE_CONFIG_DIR`, so plugin and skill installs from one trial are not visible to any other trial or to the host's Claude Code configuration

#### Scenario: Cross-trial contamination check
- **WHEN** two trials of different candidates run concurrently
- **THEN** neither trial's workspace, plugin set, skills directory, or npm global state is observable from the other trial's environment

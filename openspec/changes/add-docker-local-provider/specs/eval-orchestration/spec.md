# Delta: eval-orchestration — Docker local provider

## MODIFIED Requirements

### Requirement: Trial isolation
Each trial SHALL execute in a freshly provisioned isolated environment with no state shared between trials. The orchestrator SHALL support four isolation providers behind one interface: Daytona sandboxes (cloud, primary), E2B sandboxes (cloud, alternative), Docker containers (local, recommended local default), and git worktrees with a per-trial `CLAUDE_CONFIG_DIR` (zero-dependency fallback). All container/sandbox providers MUST run the same pinned trial-environment image definition, and MUST perform preflight validation before any trial is dispatched.

#### Scenario: Daytona trial provisioning
- **WHEN** a trial starts with the Daytona provider configured and `DAYTONA_API_KEY` present in the environment
- **THEN** the orchestrator creates a fresh sandbox from the pinned snapshot, installs the candidate framework per its registry definition, runs the trial, archives artifacts, and destroys the sandbox

#### Scenario: Docker trial provisioning
- **WHEN** a trial starts with the Docker provider configured and the pinned trial image is present locally
- **THEN** the orchestrator starts a fresh container with configured memory/CPU limits, installs the candidate framework, runs the trial, archives artifacts via `docker cp`, and force-removes the container

#### Scenario: Docker preflight
- **WHEN** a run requests the Docker provider and the Docker daemon is unreachable or the pinned image tag is absent
- **THEN** the run fails at preflight naming the problem and, for a missing image, the exact build command — and no trial is dispatched

#### Scenario: Stale container recovery
- **WHEN** a trial is provisioned and a container with the same deterministic trial name already exists from a crashed prior run
- **THEN** the stale container is force-removed before the fresh one starts, and the event is recorded in the trial's provenance notes

#### Scenario: Worktree fallback isolation
- **WHEN** a trial runs with the worktree provider
- **THEN** the trial executes in a dedicated worktree under `runs/<run-id>/trials/<trial-id>/` with a dedicated `CLAUDE_CONFIG_DIR`, so plugin and skill installs from one trial are not visible to any other trial or to the host's Claude Code configuration

#### Scenario: Cross-trial contamination check
- **WHEN** two trials of different candidates run concurrently
- **THEN** neither trial's workspace, plugin set, skills directory, or npm global state is observable from the other trial's environment

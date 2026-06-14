# Capability: eval-orchestration

## ADDED Requirements

### Requirement: Run matrix execution
The orchestrator SHALL execute an eval run as a matrix of trials, where each trial is the tuple (framework candidate, harness, model, trial index), and SHALL run every candidate against the identical vendored PRD (`prd/symphony-SPEC.md`) with the identical base task prompt template.

#### Scenario: Full matrix run
- **WHEN** the operator starts a run with 4 candidates, harness `claude-code`, model `claude-opus-4-6`, and 3 trials each
- **THEN** the orchestrator schedules 12 trials, each receiving the same PRD content and base prompt template, varying only the framework candidate and trial index

#### Scenario: Subset run for smoke testing
- **WHEN** the operator starts a run scoped to a single candidate with 1 trial
- **THEN** the orchestrator executes only that trial and produces the same artifact structure as a full run

### Requirement: Trial isolation
Each trial SHALL execute in a freshly provisioned isolated environment with no state shared between trials. The orchestrator SHALL support two isolation providers behind one interface: Daytona sandboxes (primary) and local git worktrees with a per-trial `CLAUDE_CONFIG_DIR` (fallback).

#### Scenario: Daytona trial provisioning
- **WHEN** a trial starts with the Daytona provider configured and `DAYTONA_API_KEY` present in the environment
- **THEN** the orchestrator creates a fresh sandbox from the pinned snapshot, installs the candidate framework per its registry definition, runs the trial, archives artifacts, and destroys the sandbox

#### Scenario: Worktree fallback isolation
- **WHEN** a trial runs with the worktree provider
- **THEN** the trial executes in a dedicated worktree under `runs/<run-id>/trials/<trial-id>/` with a dedicated `CLAUDE_CONFIG_DIR`, so plugin and skill installs from one trial are not visible to any other trial or to the host's Claude Code configuration

#### Scenario: Cross-trial contamination check
- **WHEN** two trials of different candidates run concurrently
- **THEN** neither trial's workspace, plugin set, skills directory, or npm global state is observable from the other trial's environment

### Requirement: Headless harness invocation
The orchestrator SHALL drive Claude Code in headless mode (`claude -p`) with JSON output, the pinned model ID, and permission prompts disabled, executing the candidate's session script as an ordered sequence of prompts with documented continuation rules.

#### Scenario: Single-prompt candidate session
- **WHEN** a Superpowers trial runs
- **THEN** the orchestrator issues one headless session containing the base task prompt and captures the streamed JSON output including the final result message

#### Scenario: Multi-command candidate session
- **WHEN** a GSD trial runs
- **THEN** the orchestrator issues the scripted command sequence (e.g., `/gsd-new-project --auto`, then per-phase plan/execute/verify commands), resuming the session or starting new sessions exactly as the candidate's session script specifies, until the script completes or a budget cap is reached

### Requirement: Budget enforcement
The orchestrator SHALL enforce per-trial wall-clock and cost ceilings and a per-run total cost ceiling. A trial that reaches a ceiling SHALL be terminated and recorded with status `capped`, retaining all artifacts produced up to that point.

#### Scenario: Trial hits wall-clock cap
- **WHEN** a trial exceeds its configured wall-clock budget
- **THEN** the orchestrator stops the active session, marks the trial `capped` with the limiting resource recorded, and proceeds to grading of whatever artifact exists

#### Scenario: Run hits total cost ceiling
- **WHEN** accumulated cost across completed and active trials reaches the run ceiling
- **THEN** the orchestrator cancels unstarted trials, marks them `skipped:budget`, and generates the report from completed trials with the gap explicitly stated

### Requirement: Failure handling and retries
The orchestrator SHALL distinguish infrastructure failures (sandbox provisioning, network, harness crash before first turn) from candidate failures (the framework ran but produced a failing artifact). Infrastructure failures SHALL be retried up to a configured limit; candidate failures SHALL NOT be retried and SHALL be graded as-is.

#### Scenario: Sandbox provisioning failure
- **WHEN** Daytona sandbox creation fails with a transient error
- **THEN** the orchestrator retries provisioning up to the configured limit before marking the trial `infra-failed`, and `infra-failed` trials are excluded from scoring with the exclusion noted in the report

#### Scenario: Candidate produces broken build
- **WHEN** a trial completes its session script but the workspace does not build
- **THEN** the trial is not retried; it proceeds to grading and receives the scores its artifact earns

### Requirement: Run provenance
The orchestrator SHALL record, per trial: candidate name and pinned version, harness and exact harness version, model ID, isolation provider and snapshot ID, session script executed, timestamps, and final status — sufficient to reproduce the trial.

#### Scenario: Provenance record completeness
- **WHEN** any trial reaches a terminal status
- **THEN** a provenance record exists containing all fields above, and the report generator can render it without consulting any other source

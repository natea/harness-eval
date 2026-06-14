# Spec Delta: eval-studio — Live Run Execution

## MODIFIED Requirements

### Requirement: Run configuration from registries
The studio SHALL present run configuration as selections sourced from the live registries: eval target (from targets/, plus a bring-your-own flow that scaffolds a target per the eval-targets spec), candidate frameworks (candidate registry), harness and model profile (their registries when present; the implemented subset otherwise), trials, budgets, and weights. Validation SHALL mirror RunConfig and registry rules exactly (e.g. framework lacking the selected harness section is unselectable with the reason shown). Submitting SHALL offer three outcomes: a zero-spend **dry-run preview** (worktree + fake executor), a **real run** executed through the orchestrator with the configured provider and budgets, or the equivalent **CLI command** for manual execution. A real run SHALL NOT begin until it passes the launch-authorization and budget-confirmation requirements below.

#### Scenario: Configure a cross-framework run
- **WHEN** the operator selects an eval target, two candidate frameworks that both support the chosen harness, a worker model, trials, budgets, and weights
- **THEN** the studio validates the combination against RunConfig + registry rules and offers dry-run preview, real run, and copy-CLI outcomes

#### Scenario: Invalid combination blocked with reason
- **WHEN** the operator selects a framework that lacks the chosen harness section
- **THEN** that framework is unselectable and the studio shows the reason, and no launch outcome is offered for it

#### Scenario: Real run requires authorization and confirmation
- **WHEN** the operator submits a real (non-dry) run
- **THEN** the studio launches it only after launch authorization succeeds and the budget confirmation is acknowledged; otherwise it returns the denial reason or the confirmation payload and starts nothing

### Requirement: Scoped writes only
The studio server SHALL write nothing except run operations through the orchestrator's public entry points: enqueuing/executing runs (dry or real) and the resulting run-directory artifacts the orchestrator itself writes (provenance, telemetry, grades, results, scorecard). The studio's own endpoints SHALL never create, modify, or delete run artifacts, grades, or reports directly. The server SHALL bind to localhost by default.

#### Scenario: No artifact mutation surface
- **WHEN** any studio endpoint other than launch/cancel is invoked
- **THEN** it performs only reads of run directories and orchestrator state and mutates no artifact

#### Scenario: Real run writes only through the orchestrator
- **WHEN** a real run executes and produces provenance, telemetry, grades, results, and a scorecard
- **THEN** those artifacts are written by the orchestrator's entry points, and no studio endpoint writes or edits them directly

## ADDED Requirements

### Requirement: Live run execution as background jobs
The studio SHALL execute a real run as a tracked background job on the studio host, following the same orchestration sequence as the CLI run path (load target and optional design, render the shared base prompt, provision the configured provider, run the trial matrix with the real session executor, optionally grade, then build and write results and scorecard). Each job SHALL expose a lifecycle — enqueued, running with per-trial states (pending, running, completed, capped, infra-failed), and a terminal completed, error, or cancelled — and a running cost-so-far derived from telemetry. The studio SHALL provide a cancel that aborts the run between trials and tears down any in-flight sandbox so a cancelled run leaks no cloud resources. Job tracking MAY be in-memory; when tracking is lost (e.g. server restart) the run's on-disk artifacts SHALL remain readable through the Runs view.

#### Scenario: Watching a real run progress
- **WHEN** a real run is executing
- **THEN** the Runs view shows live per-trial status and cost-so-far, and capped or infra-failed trials show their provenance notes, all without mutating artifacts

#### Scenario: Cancel tears down without leaking
- **WHEN** the operator cancels a running job with a sandbox in flight
- **THEN** the job stops before the next trial, the in-flight sandbox is torn down through the provider, and the job ends in the cancelled state

### Requirement: Launch authorization seam
Every real run SHALL pass through a single launch-authorization decision `canLaunch(principal, request)` that returns allow or deny-with-reason before any sandbox is provisioned. The studio SHALL resolve the active policy in one place so an alternative policy (e.g. a credit-balance check) can be substituted without changing the launch path, and SHALL invoke launched/settled hooks around a run so a policy may record or reconcile per-run effects. The default policy SHALL authorize a single local operator (optionally requiring a configured operator token) and SHALL NOT constitute an identity or billing system.

#### Scenario: Denied launch starts nothing
- **WHEN** the active policy denies a real launch
- **THEN** the studio returns the denial reason and provisions no sandbox and spends nothing

#### Scenario: Operator token required when configured
- **WHEN** an operator token is configured and a real launch is submitted without it
- **THEN** authorization is denied with a reason, and with the correct token the launch is authorized

### Requirement: Budget confirmation before spend
A real run SHALL require an explicit budget confirmation before execution. When a real launch is submitted without confirmation, the studio SHALL return the resolved budget (per-trial and per-run USD caps and wall-clock cap) together with the candidate-by-trial matrix and the selected provider and models, and SHALL start nothing. Real spend SHALL require all of: a non-dry request, a successful authorization decision, an acknowledged confirmation, and resolved budget caps that the orchestrator enforces during the run.

#### Scenario: Unconfirmed real launch returns the budget for review
- **WHEN** a real run is submitted without an acknowledged confirmation
- **THEN** the studio returns the resolved caps, matrix, provider, and models for review and provisions nothing

#### Scenario: Confirmed launch proceeds under enforced caps
- **WHEN** a real run is submitted with authorization granted and the budget confirmation acknowledged
- **THEN** the run executes and the orchestrator enforces the per-trial and per-run USD and wall-clock caps

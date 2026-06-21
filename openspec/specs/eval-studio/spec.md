# eval-studio Specification

## Purpose
TBD - created by archiving change add-live-run-durability. Update Purpose after archive.
## Requirements
### Requirement: Durable live-run state and crash recovery
The studio SHALL persist each live run's tracking state to disk so that losing
in-memory job tracking (server restart or crash) leaves the run **visible and
recoverable** rather than absent. The studio SHALL write a per-run state record under
the run directory and update it at each lifecycle transition (enqueued, building,
grading per trial, finalizing, and the terminal completed/error/cancelled), recording
at least the run id, kind, status, current stage, per-trial states, cost-so-far,
timestamps, and the owning process id. A real run SHALL execute in a process separate
from the studio HTTP server (after authorization and budget confirmation) so that a
studio server restart or crash does NOT terminate an in-flight build or grade; the
studio server SHALL read run state from disk and control a run by signalling its
owning process. The Runs view SHALL surface a run that exists only via this on-disk
state — with partial artifacts and no `results.json` — as an `interrupted` run when
its owning process is gone, or as running (with stage) when its owner is alive,
showing per-trial states either way. On startup the studio SHALL reconcile any
persisted in-progress state whose owning process is no longer alive to `interrupted`,
and SHALL NOT re-execute it. Recovery of an interrupted run that produced artifacts
SHALL be available through the existing checkpointed grading and finalize tools.

#### Scenario: Healthy run survives a server restart
- **WHEN** the studio server restarts or crashes while a real run is mid-flight in its
  own process
- **THEN** the run process keeps building/grading, and the restarted studio re-attaches
  by reading the run's on-disk state, showing it as still running with its current stage

#### Scenario: Interrupted run stays visible after its owner dies
- **WHEN** a run's owning process dies mid-flight and its in-memory tracking is lost
- **THEN** the Runs view still lists the run as `interrupted`, showing the stage it
  reached and the state of each trial, instead of the run disappearing

#### Scenario: Stale in-progress state is reconciled, not resumed
- **WHEN** the studio starts and finds a persisted run state marked in-progress whose
  recorded owning process is no longer alive
- **THEN** the studio relabels that run `interrupted` and does not re-execute or
  resume it

#### Scenario: Recovery of an interrupted run
- **WHEN** an interrupted run has trials whose builds completed on disk
- **THEN** the operator can finish it with the checkpointed grade and finalize tools
  to produce `results.json` and a scorecard, without re-running the build

#### Scenario: Live tracking still takes precedence
- **WHEN** a run is actively tracked in memory by the current server
- **THEN** the Runs view reflects the live in-memory status, and the on-disk state is
  the durable mirror used only when in-memory tracking is absent

### Requirement: Run configuration from registries
The studio SHALL present run configuration as selections sourced from the live registries: eval target (from targets/, plus a bring-your-own flow that scaffolds a target per the eval-targets spec), candidate frameworks (candidate registry), harness and model profile (their registries when present; the implemented subset otherwise), trials, budgets, and weights. When presenting the eval-target selection, the studio SHALL display each target's catalog metadata — at least its `summary`, software `shape`, and `expectedUI` indicator — so the operator can tell what artifact will be built before launching. Validation SHALL mirror RunConfig and registry rules exactly (e.g. framework lacking the selected harness section is unselectable with the reason shown). Submitting SHALL offer three outcomes: a zero-spend **dry-run preview** (worktree + fake executor), a **real run** executed through the orchestrator with the configured provider and budgets, or the equivalent **CLI command** for manual execution. A real run SHALL NOT begin until it passes the launch-authorization and budget-confirmation requirements below.

#### Scenario: Configure a cross-framework run
- **WHEN** the operator selects an eval target, two candidate frameworks that both support the chosen harness, a worker model, trials, budgets, and weights
- **THEN** the studio validates the combination against RunConfig + registry rules and offers dry-run preview, real run, and copy-CLI outcomes

#### Scenario: Invalid combination blocked with reason
- **WHEN** the operator selects a framework that lacks the chosen harness section
- **THEN** that framework is unselectable and the studio shows the reason, and no launch outcome is offered for it

#### Scenario: Real run requires authorization and confirmation
- **WHEN** the operator submits a real (non-dry) run
- **THEN** the studio launches it only after launch authorization succeeds and the budget confirmation is acknowledged; otherwise it returns the denial reason or the confirmation payload and starts nothing

#### Scenario: Target description shown before launch
- **WHEN** the operator opens the eval-target selection
- **THEN** each selectable target shows its `summary`, `shape`, and `expectedUI` so the operator knows what will be built without reading the PRD

### Requirement: Run queue and status
The studio SHALL list runs with live status (building, grading, completed) including per-trial states and capped/infra-failed badges with their provenance notes, sourced from run directories and orchestrator state without mutating artifacts.

#### Scenario: Watching a run progress
- **WHEN** a queued run is executing trials
- **THEN** the runs view shows each trial's current status and updates as provenance records land, without modifying any artifact

### Requirement: Design tokens sourced from DESIGN.md
The studio's visual theme SHALL derive from a single `src/studio/DESIGN.md` token specification (semantic color tokens, typography, spacing scale, radius, shadows), mapped into the Tailwind theme and CSS variables that shadcn components consume. `DESIGN.md` SHALL remain a specification only and SHALL NOT introduce any component implementation; shadcn/ui SHALL remain the sole component source. Theme changes SHALL be expressible as edits to `DESIGN.md` and its token mapping rather than per-component styling.

#### Scenario: Token edit re-themes without touching components
- **WHEN** a token value (e.g. primary color or radius) is changed in `DESIGN.md` and its mapping re-applied
- **THEN** shadcn components reflect the new value through the shared CSS variables, with no edits to component source

### Requirement: Review parity on shadcn components
The studio's review view SHALL provide at minimum the capabilities of the results-dashboard spec — cross-run leaderboard with normalization warnings and client-side re-weighting (shared scoring module, CLI parity), run scorecards with variance/exclusions/provenance, trial drill-down with step evidence and judge samples, step-comparison matrix, and the results schema-version gate — implemented with shadcn/ui components (Table, Card, Slider, Tooltip, Dialog, Tabs, Badge) under the project's dark theme.

#### Scenario: Re-weighting parity preserved
- **WHEN** the user adjusts weights in the studio matching a `report --weights` invocation
- **THEN** composites equal the CLI's stored results exactly

### Requirement: Scoped writes only
The studio server SHALL write nothing except run operations through the orchestrator's public entry points: enqueuing/executing runs (dry or real) and the resulting run-directory artifacts the orchestrator itself writes (provenance, telemetry, grades, results, scorecard). The studio's own endpoints SHALL never create, modify, or delete run artifacts, grades, or reports directly. The server SHALL bind to localhost by default.

#### Scenario: No artifact mutation surface
- **WHEN** any studio endpoint other than launch/cancel is invoked
- **THEN** it performs only reads of run directories and orchestrator state and mutates no artifact

#### Scenario: Real run writes only through the orchestrator
- **WHEN** a real run executes and produces provenance, telemetry, grades, results, and a scorecard
- **THEN** those artifacts are written by the orchestrator's entry points, and no studio endpoint writes or edits them directly

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

### Requirement: Trial conversation replay
The studio Trial view SHALL provide a Conversation tab that replays a trial's
rendered transcript turns with request and response visually distinguished. It
MUST source the structured turns from the same renderer that produces the
on-disk Markdown, so the browser replay and the disk artifact cannot diverge.
Large tool payloads MUST be collapsible, and a per-turn cost/token figure SHALL
be shown where the transcript records it.

#### Scenario: Replay distinguishes request from response
- **WHEN** an operator opens the Conversation tab for an archived trial
- **THEN** the view renders the ordered turns with agent-issued prompts and tool
  calls shown as requests and tool results / model output shown as responses,
  each labeled by role and direction

#### Scenario: Oversized tool payloads collapsed
- **WHEN** a turn carries a large tool input or result
- **THEN** the payload is collapsed by default and expandable on demand, so the
  conversation stays readable

#### Scenario: Served from the shared renderer
- **WHEN** the studio requests a trial's conversation
- **THEN** the turns are produced by the same parser that writes
  `conversation.md`, so the studio replay and the on-disk Markdown reflect the
  identical turn sequence

### Requirement: Trial conversation navigation
The Conversation replay SHALL be navigable without linear scrolling: the Trial
view MUST provide jump targets to its major sections and, within the
conversation, to each session, to errored turns, and through an outline of the
agent's narration. From a graded step whose outcome is not a full pass, the
operator SHALL be able to jump directly to the conversation turn that best
explains that outcome, so "why did this fail / get partial credit" is one click
from the score, not a manual scroll.

#### Scenario: Jump from a partial/failed step to the explaining turn
- **WHEN** an operator activates the trace control on an adherence step that
  scored partial or fail
- **THEN** the studio opens the Conversation replay and scrolls to the build
  turn that best matches the step's evidence (the tokens the evaluator probed
  for), highlighting it; if no turn matches, it scrolls to the conversation
  section rather than doing nothing

#### Scenario: Navigate a long transcript
- **WHEN** the conversation is long
- **THEN** the operator can jump to any session, step through errored turns, and
  open an outline of narration "chapters", each entry scrolling to its turn


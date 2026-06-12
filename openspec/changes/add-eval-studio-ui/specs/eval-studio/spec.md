# Capability: eval-studio

## ADDED Requirements

### Requirement: Run configuration from registries
The studio SHALL present run configuration as selections sourced from the live registries: eval target (from targets/, plus a bring-your-own flow that scaffolds a target per the eval-targets spec), candidate frameworks (candidate registry), harness and model profile (their registries when present; the implemented subset otherwise), trials, budgets, and weights. Validation SHALL mirror RunConfig and registry rules exactly (e.g. framework lacking the selected harness section is unselectable with the reason shown). Submitting SHALL either enqueue a local run via the orchestrator or emit the equivalent CLI command for manual execution.

#### Scenario: Configure a cross-framework run
- **WHEN** the user selects target symphony-daemon, all four frameworks, harness claude-code, model claude-opus-4-6, 3 trials
- **THEN** the studio validates the combination, shows the estimated budget envelope, and on confirm enqueues the run (or copies `bun run src/cli.ts run …`) with parameters identical to CLI semantics

#### Scenario: Invalid combination blocked with reason
- **WHEN** the user selects a framework that has no section for the chosen harness
- **THEN** the selection is rejected inline citing the missing harness section, before any run is created

### Requirement: Run queue and status
The studio SHALL list runs with live status (building, grading, completed) including per-trial states and capped/infra-failed badges with their provenance notes, sourced from run directories and orchestrator state without mutating artifacts.

#### Scenario: Watching a run progress
- **WHEN** a queued run is executing trials
- **THEN** the runs view shows each trial's current status and updates as provenance records land, without modifying any artifact

### Requirement: Review parity on shadcn components
The studio's review view SHALL provide at minimum the capabilities of the results-dashboard spec — cross-run leaderboard with normalization warnings and client-side re-weighting (shared scoring module, CLI parity), run scorecards with variance/exclusions/provenance, trial drill-down with step evidence and judge samples, step-comparison matrix, and the results schema-version gate — implemented with shadcn/ui components (Table, Card, Slider, Tooltip, Dialog, Tabs, Badge) under the project's dark theme.

#### Scenario: Re-weighting parity preserved
- **WHEN** the user adjusts weights in the studio matching a `report --weights` invocation
- **THEN** composites equal the CLI's stored results exactly

### Requirement: Scoped writes only
The studio server SHALL write nothing except run enqueue operations through the orchestrator's public entry points; run artifacts, grades, and reports SHALL never be created, modified, or deleted by studio endpoints. The server SHALL bind to localhost by default.

#### Scenario: No artifact mutation surface
- **WHEN** the studio server's HTTP surface is enumerated
- **THEN** the only mutating endpoint is run-launch, and it accepts only RunConfig-shaped parameters

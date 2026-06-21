## MODIFIED Requirements

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

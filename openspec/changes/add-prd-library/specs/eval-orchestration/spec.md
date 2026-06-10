# Delta: eval-orchestration — target-parameterized runs

## MODIFIED Requirements

### Requirement: Run matrix execution
The orchestrator SHALL execute an eval run as a matrix of trials, where each trial is the tuple (framework candidate, harness, model, trial index), against a single selected eval target per run. The orchestrator SHALL load the PRD content and prompt-template parameters from the target, and every candidate SHALL receive the identical rendered base task prompt and PRD content. Trial provenance SHALL record the target name, version, PRD hash, and test-plan hash.

#### Scenario: Target-selected run
- **WHEN** the operator starts a run with `--target cli-tool` and 4 candidates × 1 trial
- **THEN** all 4 trials receive the cli-tool PRD and its rendered prompt, and each provenance record names the target and its hashes

#### Scenario: Default target compatibility
- **WHEN** the operator starts a run without specifying a target
- **THEN** the run uses `symphony-daemon`, preserving pre-library behavior

#### Scenario: Subset run for smoke testing
- **WHEN** the operator starts a run scoped to a single candidate with 1 trial
- **THEN** the orchestrator executes only that trial and produces the same artifact structure as a full run

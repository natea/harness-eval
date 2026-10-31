# Spec Delta: eval-orchestration — brownfield trials

## ADDED Requirements

### Requirement: Brownfield trial execution
A run SHALL be able to target a set of brownfield task bundles and an issue variant instead of a PRD target. For each trial the workspace SHALL be the task's sealed base repository on a fresh branch, inside the task's prebuilt environment, with the selected issue variant written to a fixed file in the workspace root. The rendered base prompt SHALL come from a brownfield template that references the issue file, and SHALL be identical for every candidate in the run.

#### Scenario: Workspace seeded from the bundle
- **WHEN** a brownfield trial starts
- **THEN** the workspace contains the sealed repository at the base commit on a new branch and the selected issue variant file, and contains neither the reference patch nor the hidden test patch

#### Scenario: Identical prompt across candidates
- **WHEN** two candidates run the same task and variant
- **THEN** their rendered base prompts are byte-identical

### Requirement: Generic anti-cheat clause
The brownfield base prompt SHALL instruct the worker not to consult upstream history, pull requests, issues, or releases beyond what is provided, and SHALL NOT name the fixing pull request, its commits, or its URL.

#### Scenario: Prompt does not point at the answer
- **WHEN** the brownfield base prompt is rendered for a task
- **THEN** it contains the anti-cheat clause and does not contain the PR number, merge SHA, or any pull-request URL

### Requirement: Brownfield network and tool lockdown
During a brownfield trial, network egress from the sandbox SHALL be blocked except to the run's model API endpoint, and server-side web tools (search/fetch tools executed by the model provider rather than in the sandbox) SHALL be disabled for every candidate through harness configuration. A candidate whose harness cannot disable such tools SHALL be refused for brownfield runs rather than run unequally.

#### Scenario: Upstream unreachable
- **WHEN** a worker attempts to reach the repository host from inside the sandbox
- **THEN** the connection fails

#### Scenario: Harness without a tool kill-switch
- **WHEN** a candidate's harness exposes a provider-side web tool that cannot be disabled
- **THEN** run validation rejects that candidate for brownfield runs with a message naming the tool

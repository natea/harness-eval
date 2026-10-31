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
During a brownfield trial, network egress from the sandbox SHALL be blocked except to the run's model gateway, and server-side web tools (search/fetch tools executed by the model provider rather than in the sandbox) SHALL be disabled for every candidate through harness configuration. A candidate whose harness cannot disable such tools, or cannot be pointed at the gateway, SHALL be refused for brownfield runs rather than run unequally.

#### Scenario: Upstream unreachable
- **WHEN** a worker attempts to reach the repository host from inside the sandbox
- **THEN** the connection fails

#### Scenario: Harness without a tool kill-switch
- **WHEN** a candidate's harness exposes a provider-side web tool that cannot be disabled
- **THEN** run validation rejects that candidate for brownfield runs with a message naming the tool

### Requirement: Model gateway
The orchestrator SHALL run a model gateway outside the sandbox. The sandbox SHALL hold no real model credential; the gateway SHALL inject the credential, forward only to the run's configured provider and model, reject any request that enables provider-side tools, and log every request.

#### Scenario: Worker holds no real credential
- **WHEN** a worker inspects its environment and configuration files
- **THEN** only a placeholder credential is present, and requests succeed only through the gateway

#### Scenario: Direct request enabling provider-side search
- **WHEN** a request reaching the gateway enables a provider-side web search or fetch tool
- **THEN** the gateway rejects it, logs it, and the trial is flagged for review

#### Scenario: Fixed model across harnesses
- **WHEN** a run holds the model fixed and a candidate's native provider differs from the run's model
- **THEN** the candidate's endpoint override points it at the gateway serving the run's model, and the report marks the pairing as non-native

### Requirement: Clean per-trial environment
Each brownfield trial SHALL start with a freshly generated home directory and harness configuration containing no user MCP servers, plugins or skills, memory files, global instructions, or state from earlier trials, beyond what the candidate definition installs.

#### Scenario: No inherited configuration
- **WHEN** a brownfield trial starts on a provider that shares the host filesystem (e.g. worktree)
- **THEN** the harness sees only the trial's generated home and configuration, not the operator's

### Requirement: Application network during trials
The application's own outbound traffic during a brownfield trial (e.g. calls the repository's code makes to LLM provider APIs) SHALL default to recorded fixtures only, with no live egress. A task MAY opt in with `appEgress: gateway`, which SHALL route the application's provider calls through the model gateway with a separate, budget-capped credential, the same provider-side tool rejection, and request logging.

#### Scenario: Default task
- **WHEN** a worker runs the application live in a task with `appEgress: none`
- **THEN** the application's outbound calls fail, and tests remain runnable in recorded-fixture mode

#### Scenario: Opt-in task
- **WHEN** a task declares `appEgress: gateway`
- **THEN** the application's provider calls succeed through the gateway under the task's budget cap and appear in the gateway log

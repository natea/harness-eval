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
The orchestrator SHALL run a model gateway outside the sandbox. The sandbox SHALL hold no real model credential; the gateway SHALL inject the credential (an API key by default), forward only to the run's configured provider and model, reject any request that enables provider-side tools, and log every request. Candidates SHALL reach the gateway only through an endpoint override in the gateway's own protocol; the gateway SHALL NOT translate between protocols.

#### Scenario: Worker holds no real credential
- **WHEN** a worker inspects its environment and configuration files
- **THEN** only a placeholder credential is present, and requests succeed only through the gateway

#### Scenario: Direct request enabling provider-side search
- **WHEN** a request reaching the gateway enables a provider-side web search or fetch tool
- **THEN** the gateway rejects it, logs it, and the trial is flagged for review

#### Scenario: Protocol mismatch refused
- **WHEN** a candidate's harness speaks a different API protocol than the gateway serving the run's model
- **THEN** run validation refuses the candidate for that run rather than translating requests

### Requirement: Model slot pinning
Every Claude Code candidate in a brownfield run SHALL have all of its model slots (opus, sonnet, and haiku, including background requests) pinned to the run's model, so that every request it sends passes the gateway's model check.

#### Scenario: Background request on the haiku slot
- **WHEN** a Claude Code candidate sends a background request on its haiku slot
- **THEN** the request names the run's model and the gateway forwards it

### Requirement: Gateway preflight probe
Before any trial is dispatched, the orchestrator SHALL send one minimal request per candidate, with that candidate's harness configuration, through the gateway. If the gateway rejects or fails the probe, the run SHALL fail before any trial spend, naming the candidate and the rejection reason.

#### Scenario: Harness still declares a server-side tool
- **WHEN** a candidate's probe request declares a provider-side web tool despite its kill-switch
- **THEN** the gateway rejects the probe and the run fails before dispatch, naming the candidate and the tool

### Requirement: Application network during trials
The application's own outbound traffic during a brownfield trial (e.g. calls the repository's code makes to LLM provider APIs) SHALL default to recorded fixtures only, with no live egress. A task MAY opt in with an `appEgress` allowlist of provider endpoints and model names; the gateway SHALL forward the application's calls only to those entries, using a separate, budget-capped credential, the same provider-side tool rejection, and request logging.

#### Scenario: Default task
- **WHEN** a worker runs the application live in a task with no `appEgress` allowlist
- **THEN** the application's outbound calls fail, and tests remain runnable in recorded-fixture mode

#### Scenario: Opt-in task
- **WHEN** a task's `appEgress` allowlist lists `gpt-4o` and `text-embedding-3-small` on the OpenAI endpoint
- **THEN** the application's calls to those models succeed through the gateway under the task's budget cap and appear in the gateway log, and a call to any other model is rejected

### Requirement: Framework entry routing
A brownfield candidate whose session starts with only the base prompt SHALL get a routing step first: consult the framework's own help or usage guidance, state which of its commands or skills fits the task, and invoke it. Candidates whose session starts with their own command, and candidates with no framework, SHALL NOT be routed.

#### Scenario: Auto-engaging framework is routed
- **WHEN** a framework relies on auto-engagement and its session is only the base prompt
- **THEN** its first prompt begins with the routing step and the base prompt follows unchanged

### Requirement: Routing text is neutral
The routing text SHALL be identical for every framework apart from its name and SHALL NOT name any command, so the framework's own guidance chooses what fits the task.

#### Scenario: Feature request, not a bug
- **WHEN** the task is a new feature rather than a bug report
- **THEN** the routing step does not steer the agent to a debugging command; the framework's guidance picks the command (for example a planning or design skill)

### Requirement: Post-install harness check
After a candidate's install steps and before the agent starts, the orchestrator SHALL check what the harness can see (installed and enabled plugins, and skills, commands or agents in the user and project configuration) and record it in provenance. A framework candidate with nothing visible SHALL fail the trial without retry and before any model spend.

#### Scenario: Install left nothing visible
- **WHEN** a framework candidate's install exits successfully but no plugin is enabled and no skills or commands exist
- **THEN** the trial fails with the check's output before the agent starts

## MODIFIED Requirements

### Requirement: Trial isolation
Each trial SHALL execute in a freshly provisioned isolated environment with no state shared between trials. The orchestrator SHALL support two isolation providers behind one interface: Daytona sandboxes (primary) and local git worktrees with a per-trial `CLAUDE_CONFIG_DIR` (fallback). Each trial SHALL also start with a freshly generated home directory and harness configuration containing no operator MCP servers, plugins or skills, memory files, or global instructions beyond what the candidate definition installs.

#### Scenario: Daytona trial provisioning
- **WHEN** a trial starts with the Daytona provider configured and `DAYTONA_API_KEY` present in the environment
- **THEN** the orchestrator creates a fresh sandbox from the pinned snapshot, installs the candidate framework per its registry definition, runs the trial, archives artifacts, and destroys the sandbox

#### Scenario: Worktree fallback isolation
- **WHEN** a trial runs with the worktree provider
- **THEN** the trial executes in a dedicated worktree under `runs/<run-id>/trials/<trial-id>/` with a dedicated `CLAUDE_CONFIG_DIR`, so plugin and skill installs from one trial are not visible to any other trial or to the host's Claude Code configuration

#### Scenario: Cross-trial contamination check
- **WHEN** two trials of different candidates run concurrently
- **THEN** neither trial's workspace, plugin set, skills directory, or npm global state is observable from the other trial's environment

#### Scenario: No inherited operator configuration
- **WHEN** a trial starts on a provider that shares the host filesystem (e.g. worktree)
- **THEN** the harness sees only the trial's generated home and configuration, and none of the operator's MCP servers, memory files, or global instructions

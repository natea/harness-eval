# candidate-registry Specification

## Purpose
TBD - created by archiving change setup-harness-eval-framework. Update Purpose after archive.
## Requirements
### Requirement: Declarative candidate definitions
The system SHALL define each framework candidate in a versioned YAML registry entry containing: name, source repo URL, pinned version, per-harness install steps, session script (ordered invocation protocol), continuation/approval policy, and framework marker paths (directories/files the framework creates that identify it).

#### Scenario: Registry validates on load
- **WHEN** the orchestrator loads the candidate registry
- **THEN** every entry is validated against the registry schema, and a missing required field (e.g., no pinned version) fails the run before any sandbox is provisioned

#### Scenario: Four initial candidates
- **WHEN** the shipped registry is loaded
- **THEN** it contains entries for Superpowers (obra/superpowers, plugin install), Compound Engineering (EveryInc/compound-engineering-plugin, plugin install + `/ce-setup`), Agent Skills (addyosmani/agent-skills, plugin or skills-dir install), and GSD (open-gsd/gsd-core via pinned `npx @opengsd/gsd-core` non-interactive install)

### Requirement: Version pinning
Every candidate entry MUST pin an exact released version (plugin version, npm version, or git commit SHA). The install step SHALL fail the trial if the pinned version cannot be obtained, rather than silently installing latest.

#### Scenario: Pinned version unavailable
- **WHEN** a candidate's pinned version cannot be fetched during sandbox setup
- **THEN** the trial fails as `infra-failed` with the version mismatch recorded, and no run against an unpinned version occurs

### Requirement: Harness-scoped install and invocation
Candidate entries SHALL scope install steps and session scripts per harness identifier (`claude-code` now; `opencode`, `codex` later), so adding a new harness requires only adding a new harness section per candidate, with no change to orchestration or grading.

#### Scenario: Unknown harness requested
- **WHEN** a run requests harness `opencode` and a candidate entry has no `opencode` section
- **THEN** the run fails validation at load time, naming the candidate and missing harness section

### Requirement: Fairness constraints in session scripts
The base task prompt template SHALL be defined once at registry level and shared by all candidates. Candidate session scripts MAY add only the framework's own prescribed commands and continuation prompts; they MUST NOT add task-specific hints, PRD summaries, or implementation guidance beyond the shared template. Within a run, every candidate SHALL execute on the identical worker-model profile (same provider, model ID, and endpoint), resolved once from the model registry.

#### Scenario: Shared base prompt
- **WHEN** session scripts for all candidates are rendered for a run
- **THEN** each rendered script embeds the identical base task prompt text, differing only in framework-prescribed command wrappers

#### Scenario: Continuation prompts are content-free
- **WHEN** a candidate's approval policy issues a continuation
- **THEN** the continuation text is a generic proceed instruction from a fixed allowlist and contains no task-specific content

#### Scenario: Single worker profile per run
- **WHEN** a run executes 4 candidates with `workerModel: glm-4.7`
- **THEN** all trial sessions across all candidates resolve to the same z.ai endpoint and GLM model ID, recorded identically in each trial's provenance


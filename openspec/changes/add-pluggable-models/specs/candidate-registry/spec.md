# Delta: candidate-registry — worker-model fairness

## MODIFIED Requirements

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

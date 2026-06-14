# model-registry Specification

## Purpose
TBD - created by archiving change add-pluggable-models. Update Purpose after archive.
## Requirements
### Requirement: Model profiles
The system SHALL define worker and judge models as named profiles in a versioned registry (`config/models.yaml`), each declaring provider, model ID, transport kind, endpoint environment (e.g. `ANTHROPIC_BASE_URL`), auth source (env var name, with optional injection alias such as `ANTHROPIC_AUTH_TOKEN`), and optional token pricing. Profile resolution SHALL produce the model flag, environment map, and auth injection consumed by the worker session driver and both grading drivers, with no code changes per model.

#### Scenario: GLM worker via z.ai
- **WHEN** a run is configured with `workerModel: glm-4.7` and `ZAI_API_KEY` is present in the environment
- **THEN** trial sessions run Claude Code against z.ai's Anthropic-compatible endpoint with the GLM model ID, and provenance records provider `z.ai`, the model ID, and the endpoint host — never the key

#### Scenario: Unknown profile fails fast
- **WHEN** a run references a model name that is neither a registry profile nor a `claude-*` implicit native profile
- **THEN** validation fails before any sandbox is provisioned, listing available profiles

### Requirement: Fairness and judge-validity rules
Within a run, every candidate SHALL use the identical worker-model profile. The judge profile MUST differ from the worker profile. When judge and worker providers differ, the run SHALL set a cross-vendor-judge flag recorded in provenance and surfaced as a caveat in reports.

#### Scenario: Self-grading rejected
- **WHEN** a run config sets judgeModel equal to workerModel
- **THEN** validation fails citing the judge-independence rule

#### Scenario: Cross-vendor judging flagged
- **WHEN** a GLM-worker run is judged by a Claude judge profile
- **THEN** the run executes, and provenance plus the scorecard carry a cross-vendor-judge caveat

### Requirement: Cost source accounting
Trial telemetry SHALL record how cost was determined: `harness-reported` (e.g. Claude Code `total_cost_usd` on Anthropic billing), `profile-priced` (token usage × profile pricing), or `tokens-only` (no pricing available). The token-spend dimension SHALL use a single consistent cost source within a run, falling back to raw token counts when dollars are unavailable.

#### Scenario: Profile-priced GLM run
- **WHEN** a GLM-worker trial completes and the profile declares pricing
- **THEN** trial cost is computed from captured token usage and recorded with source `profile-priced`

### Requirement: Profile probe
The CLI SHALL provide a probe (`model probe <profile>`) that performs a minimal worker-path session and a minimal judge-path call for the profile, reporting auth and protocol health, so misconfigured profiles fail before any matrix spend.

#### Scenario: Probe catches bad auth
- **WHEN** `model probe glm-4.7` runs with a missing or invalid `ZAI_API_KEY`
- **THEN** the probe exits nonzero naming the auth problem, and no trial-scale spend occurs


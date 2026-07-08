# Capability: model-registry

## ADDED Requirements

### Requirement: Credential-free auth kind for local models
The model registry SHALL support an auth kind `none` for model profiles whose
endpoint requires no credential (e.g. a local Ollama server). A
`none` profile SHALL resolve with no auth environment variable injected and SHALL
NOT cause a missing-credential failure. Worker and judge resolution SHALL treat a
`none` profile as fully configured.

#### Scenario: Local profile resolves without a credential
- **WHEN** a run uses a worker profile with `authKind: none` and no API key is set
- **THEN** profile resolution succeeds, injects no auth env var, and the trial
  proceeds without a credential error

#### Scenario: None profile records tokens-only cost
- **WHEN** a `none`-auth local profile completes a trial and declares no pricing
- **THEN** the trial cost source is recorded as `tokens-only`, never a fabricated
  dollar figure

### Requirement: Local OSS worker via Codex open-source mode
The model registry SHALL support driving a local open-source model as the worker
through the Codex harness's built-in OSS mode. A worker profile MAY declare an
`ossProvider` of `ollama`; such a profile SHALL use
`transport: codex` and `authKind: none`. When a run uses such a profile, the Codex
driver SHALL invoke `codex exec --oss --local-provider <ossProvider> --model
<modelId>` and SHALL NOT perform an API-key login. Provenance SHALL record the
provider label, the model id, and `authKind none`.

#### Scenario: Ollama worker via Codex OSS mode
- **WHEN** a run is configured with `--harness codex` and a worker profile whose
  `ossProvider` is `ollama`
- **THEN** trial sessions run `codex exec --oss --local-provider ollama --model
  <id>` with no login step, and provenance records provider `ollama` and the model id

#### Scenario: OSS marker requires Codex transport
- **WHEN** a profile declares `ossProvider` with a non-`codex` transport
- **THEN** registry validation fails before any sandbox is provisioned, naming the
  constraint

### Requirement: Local OpenAI-compatible judge transport
The model registry SHALL support a transport `openai-compat` for local models
exposed via an OpenAI-compatible `/v1/chat/completions` API. Such a profile SHALL
declare a `baseUrl` and `authKind: none`. Resolution SHALL produce the base URL
for consumption by the grading judge client with no per-model code change.

#### Scenario: Local OpenAI-compatible judge profile resolves
- **WHEN** a judge profile declares `transport: openai-compat`, a `baseUrl`, and
  `authKind: none`
- **THEN** resolution yields the base URL for the judge client, injects no
  credential, and provenance records the endpoint host

#### Scenario: openai-compat requires a base URL
- **WHEN** an `openai-compat` profile omits `baseUrl`
- **THEN** registry validation fails listing the missing field

#### Scenario: openai-compat rejects credentialed remote profiles
- **WHEN** an `openai-compat` profile declares `authKind: api-key` or an `authEnv`
- **THEN** registry validation fails because remote OpenAI-compatible endpoints are
  outside this local-model change

### Requirement: Local-endpoint reachability probe
The CLI profile probe (`model probe <profile>`) SHALL, for local/OpenAI-compatible
profiles, check that the endpoint is reachable and the named model is present
before any matrix-scale run — Ollama workers via `/api/tags` and local
OpenAI-compatible judges via `/v1/models` — so a stopped server or unpulled
model fails fast rather than inside a trial.

#### Scenario: Probe catches an unreachable local server
- **WHEN** `model probe ollama-qwen3-coder` runs while the Ollama server is down
- **THEN** the probe exits nonzero naming the endpoint and a start/pull hint, and
  no trial-scale work occurs

#### Scenario: Probe catches a missing model
- **WHEN** `model probe` runs against a reachable server that lacks the named model
- **THEN** the probe exits nonzero naming the missing model and the pull command

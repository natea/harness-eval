# Proposal: Add the Codex CLI as an evaluatable harness

> Builds on **`harness-drivers`** (the `HarnessDriver` contract +
> dispatch-by-`HarnessId`, now applied). This change contributes one driver.
> `codex` was one of the original stub `HarnessId`s; this gives it a real driver.

## Why

The [Codex CLI](https://github.com/openai/codex) is OpenAI's official open-source
terminal coding agent. It was named as a target harness id from the start but has
no driver yet. Adding it lets the eval compare an OpenAI-stack harness against the
others. Its `codex exec` subcommand runs non-interactively against a single prompt,
which fits the headless trial flow.

## What Changes

- **Register a Codex CLI `HarnessDriver`** for the `codex` `HarnessId`:
  - **Install**: pinned `@openai/codex` (npm) in the trial image, version-asserted.
  - **Headless run**: `codex exec "<prompt>"` (non-interactive automation mode) in
    the workspace; continuation, if needed, only from the registry's content-free
    allowlist.
  - **Model + auth (model-agnostic)**: Codex is **not** OpenAI-only — it drives any
    model via `[model_providers.<id>]` config (`base_url`, `env_key`, `wire_api`) or
    the built-in `openai`/`ollama`/`lmstudio` providers, plus `--oss` for local
    models. The driver configures Codex's provider + model from the run's pinned
    worker-model profile (key/endpoint from the model registry). **Wire constraint:**
    since Feb 2026 Codex speaks only the OpenAI **Responses API**
    (`wire_api = "responses"`), so a non-OpenAI endpoint must expose the Responses
    API or sit behind a translating gateway (e.g. LiteLLM/OpenRouter) — verify at
    impl.
  - **Telemetry**: map `codex exec --json` (JSONL event stream) to `SessionRecord`;
    cost via the harness-driver cost-source rule (`harness-reported` if Codex emits
    dollars, else `profile-priced` from OpenAI pricing, else `tokens-only`). Output
    redirected to a file in the sandbox and read after exit.
  - **Contract conformance**: ship a Codex conformance fixture so the driver passes
    the shared driver-contract test suite (dispatch, output-by-file capture,
    telemetry normalization, cost-source, unknown-id rejection).
- **Candidate-registry**: candidates may add a `codex:` harness block.

## Fairness note (model-agnostic harness)

Unlike the Gemini and Grok CLIs, the Codex CLI is **model-agnostic** (custom
`model_providers` + `--oss`), like Goose and OpenHands. So it can **hold the worker
model fixed** and take part in a *pure* harness comparison — provided the same model
is reachable by every harness in the run. The practical limiter is the wire
protocol: Codex requires the Responses API, while e.g. Claude Code drives Anthropic
models, so the set of models both can drive directly is narrow (a shared gateway can
widen it). The generic cross-harness rule still applies: a run pins one worker-model
profile across harnesses and is keyed by (candidate, harness, workerModel); a run
where harnesses end up on *different* models is reported as a harness+model
comparison (provenance + scorecard caveat) — but this is the ordinary cross-model
caveat, **not** a model-lock intrinsic to Codex.

**Judge neutrality:** the blind judge SHALL be neutral to the harnesses being
compared — a judge from neither compared vendor avoids self-preference bias (per the
`harness-drivers` judge-neutrality requirement; a non-neutral judge is flagged as a
caveat).

## Capabilities

### Modified Capabilities

- `harness-drivers`: adds the Codex CLI driver (model-agnostic via `model_providers`,
  with contract-suite conformance).

## Impact

- New driver under `src/driver/harnesses/` registered for `codex`; trial image gains
  a pinned `@openai/codex`; the worker-model's auth env var (the configured
  provider's `env_key`, e.g. `OPENAI_API_KEY` for the OpenAI provider) added to
  `.env.example` + redaction.
- A Codex conformance fixture added to the driver-contract test suite.
- Probe + one smoke trial before matrix use; provenance records the resolved
  provider + model so cross-model runs carry the ordinary harness+model caveat.

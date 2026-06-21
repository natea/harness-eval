# Design: Codex CLI harness driver

Builds on `harness-drivers`. Verify exact flags against the pinned version at impl.

## Install / run
Pin `@openai/codex` (npm) in `infra/trial-image`, version-asserted. Headless:
`codex exec "<prompt>"` (non-interactive automation mode) in the workspace cwd — no
TUI/REPL. Sandbox/approval flags set so the run does not block on interactive gates;
bounded continuation only from the registry's content-free allowlist.

## Model + auth (model-agnostic)
Codex is **not** OpenAI-only. It drives any model via `[model_providers.<id>]`
config (`base_url`, `env_key`, `wire_api`), the built-in `openai`/`ollama`/`lmstudio`
providers, or `--oss` for local models. The driver maps the run's pinned
worker-model profile (key/endpoint from the model registry) onto a Codex provider:
the OpenAI provider with the registry key for OpenAI models, or a custom
`model_providers` block (base_url + env_key) for others. **Wire constraint:** since
Feb 2026 Codex speaks only the OpenAI **Responses API** (`wire_api = "responses"`);
Chat-Completions was removed. So a non-OpenAI endpoint must expose the Responses API
or sit behind a translating gateway (LiteLLM/OpenRouter).

**Auth mechanism (verified against codex 0.139.0).** Codex authenticates from
`$CODEX_HOME/auth.json`, NOT from `$OPENAI_API_KEY` directly — a bare key env still
returns `401 Missing bearer`. The driver therefore runs
`printenv OPENAI_API_KEY | codex login --with-api-key` into an isolated, per-slot
`CODEX_HOME` before `codex exec`. The fresh trial sandbox has no ambient sign-in, so
the run's key is used; on a dev host an existing ChatGPT sign-in would otherwise take
precedence (and rejects API-only models like `gpt-5-codex`). The model id is passed
through to `codex exec --model`. (OpenAI-provider path; a non-OpenAI worker model is
the `model_providers` follow-up.)

## Telemetry
Map `codex exec --json` (JSONL event stream) to `SessionRecord` (duration, tokens,
turns). Cost-source per the harness-driver rule: `harness-reported` if Codex emits
dollar cost, else `profile-priced` from OpenAI pricing, else `tokens-only`.
File-redirect output and read after exit (the agent-built-daemon-inherits-stdout
footgun applies here too).

## Contract conformance
Add a Codex conformance fixture (a captured `codex exec --json` sample) to the
driver-contract suite so the driver's dispatch, output-by-file capture, telemetry
normalization, cost-source, and unknown-id rejection are all asserted — same gate
every registered driver passes.

## Fairness (model-agnostic)
Because Codex is model-agnostic (like Goose/OpenHands), it can hold the worker model
fixed and participate in a pure harness comparison where the same model is reachable
by every harness (limited in practice by the Responses-API wire requirement; a
shared gateway widens it). A run that ends up with harnesses on different models is
the ordinary cross-model case → provenance + scorecard caveat. Judge stays neutral
to the compared harnesses.

## Open questions
- Exact non-interactive flags + sandbox/approval settings for the pinned Codex CLI.
- The cleanest way to inject a `model_providers` block per run (config.toml/profile
  vs flags) and map the model registry's key/base_url onto it.
- Which registry worker models are reachable from Codex given the Responses-API-only
  constraint (native OpenAI vs gateway-fronted others).
- Shape/stability of the `codex exec --json` event stream for telemetry parsing.

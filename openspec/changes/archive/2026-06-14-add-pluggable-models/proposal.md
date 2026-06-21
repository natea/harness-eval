# Proposal: Pluggable LLM Providers and Models

## Why

The harness hard-codes one model stack: Claude Code as harness, `claude-opus-4-6` as the worker, `claude-sonnet-4-6` as judge, all billed through Anthropic auth (Max OAuth or API key). The eval's whole premise is comparison, and the next questions are already queued: the same four frameworks driven by GLM-5.1 / GLM-4.7 / GLM-4.5-Air via z.ai's Anthropic-compatible coding-plan endpoint, and eventually Kimi K2, MiniMax M3, and Qwen Coder. Today that requires code edits; it should be configuration.

## What Changes

- Introduce a **model-provider registry** (`config/models.yaml`): named model profiles declaring provider, model ID, endpoint mechanics, and auth source. Two transport kinds cover everything currently in scope:
  - `claude-code` — model runs *through* Claude Code via env injection (`ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN`); this is z.ai's documented Claude Code integration for GLM models, and also how Kimi/MiniMax/Qwen Anthropic-compatible endpoints plug in.
  - `anthropic-sdk` — direct SDK calls with optional `baseURL` override (judge/evaluator SDK driver, native Anthropic models).
- **Worker model** becomes a run-config reference into that registry (`workerModel: glm-4.7`), resolved to harness env + model flag by the existing session driver; **judge/evaluator model** likewise (`judgeModel: claude-sonnet-4-6` stays default).
- **Auth becomes per-profile**: each profile names its env var (`ZAI_API_KEY`, `MOONSHOT_API_KEY`, …); secrets stay env-only, get added to `.env.example` and the redaction list.
- **Judge-validity guardrails** encoded in config validation: the judge profile must not equal the worker profile (existing self-grading rule, generalized); cross-vendor judging (e.g., GLM judging Claude-built artifacts or vice versa) is allowed but flagged in provenance and the scorecard as a judge-bias caveat.
- Provenance/results record the resolved profile (provider, model ID, endpoint host — never the key) for worker and judge; results keyed by (candidate, harness, **workerModel**) so cross-model leaderboards group correctly.
- Cost/limits metadata per profile (optional $/Mtok in/out) so telemetry can estimate spend for providers whose harness reports tokens but not dollars (Claude Code's `total_cost_usd` is Anthropic-priced; GLM runs need profile-supplied pricing or report tokens-only).

## Capabilities

### New Capabilities

- `model-registry`: Model-profile schema, transport kinds, auth resolution, validation rules (judge≠worker, flag cross-vendor judging), provenance recording.

### Modified Capabilities

- `candidate-registry`: Harness-scoped install/session definitions gain nothing new, but the fairness rule extends: within a run, every candidate uses the identical worker-model profile.
- `run-telemetry`: Cost capture generalizes — `total_cost_usd` used when the harness reports it natively; otherwise computed from token counts × profile pricing, with the source (`harness-reported` | `profile-priced` | `tokens-only`) recorded.

## Impact

- New `config/models.yaml` + zod schema; `RunConfig.model`/`judgeModel` become profile references (string names resolve through the registry; bare Anthropic model IDs keep working as implicit profiles for backward compatibility).
- Session driver passes profile env (base URL, auth token var) into the sandbox alongside existing worker auth; judge/evaluator drivers (both `cc` and `sdk`) resolve their profile the same way.
- `.env.example` + redaction list gain `ZAI_API_KEY` (and future provider keys).
- Existing results remain valid: their provenance already records literal model IDs, which map to implicit profiles.
- Risk surface: per-provider behavioral differences inside Claude Code (tool-call fidelity, stream-json shape) — each new profile requires a cheap probe + one smoke trial before matrix use, same discipline as new sandbox providers.

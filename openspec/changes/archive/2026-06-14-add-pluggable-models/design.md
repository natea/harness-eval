# Design: Pluggable LLM Providers and Models

## Context

Three places consume a model identity today: the worker session driver (`claude -p --model …` inside the trial sandbox, authed by `CLAUDE_CODE_OAUTH_TOKEN`/`ANTHROPIC_API_KEY` pass-through), the CC grading driver (host-side headless Claude Code), and the SDK grading driver (Anthropic SDK). z.ai's documented Claude Code integration (docs.z.ai/devpack/tool/claude) works by exporting `ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic` and `ANTHROPIC_AUTH_TOKEN=<zai key>` so Claude Code talks to GLM models with unchanged tooling — the same pattern Moonshot (Kimi), MiniMax, and Alibaba (Qwen) expose via Anthropic-compatible endpoints. This means model pluggability is overwhelmingly an *environment-resolution* problem, not a new-driver problem.

## Goals / Non-Goals

**Goals:**
- Model swap = config edit: `workerModel: glm-4.7` runs the whole matrix on GLM via z.ai with no code changes.
- Judge model independently pluggable with validity rules enforced (judge ≠ worker; cross-vendor flagged).
- Honest cost accounting when the harness can't price tokens.

**Non-Goals:**
- Non-Anthropic-protocol transports (OpenAI-API-only models, local llama.cpp, Bedrock/Vertex routing) — the profile schema leaves room (`kind` is extensible) but no such transport ships in this change.
- Swapping the *harness* (OpenCode, Codex) — that remains the candidate-registry's `harnesses` axis, already designed (phase 2). This change is orthogonal: it varies what's behind the harness.
- Model-mixing within a run (different candidates on different models) — forbidden by the fairness rule.

## Decisions

- **D1 — Profile schema** (`config/models.yaml`):
  ```yaml
  profiles:
    claude-opus-4-6:        # implicit-style native profile, spelled out
      provider: anthropic
      modelId: claude-opus-4-6
      transport: claude-code         # also usable by sdk driver natively
      auth: { envVar: CLAUDE_CODE_OAUTH_TOKEN, fallbackEnvVar: ANTHROPIC_API_KEY }
    glm-4.7:
      provider: z.ai
      modelId: glm-4.7
      transport: claude-code
      env:
        ANTHROPIC_BASE_URL: https://api.z.ai/api/anthropic
      auth: { envVar: ZAI_API_KEY, injectAs: ANTHROPIC_AUTH_TOKEN }
      pricing: { inPerMtok: 0.6, outPerMtok: 2.2 }   # optional, for cost synthesis
  ```
  Resolution = profile → (model flag, env map, auth injection) consumed identically by the worker driver and the CC grading driver; the SDK driver accepts `baseURL` + key from the same profile when `transport: anthropic-sdk`-compatible.
- **D2 — Backward compatibility**: a model string not found in the registry but matching `^claude-` resolves as an implicit native profile (current behavior). Anything else unknown fails validation with the available profile list.
- **D3 — Fairness and validity rules** at config-validation time: one worker profile per run; judge profile ≠ worker profile; if judge.provider ≠ worker.provider, set `crossVendorJudge: true` in provenance and render a caveat badge in scorecard/leaderboard (bias direction unknown; ViBench's human-agreement evidence doesn't transfer across vendors).
- **D4 — Cost source tracking** in telemetry: `costSource: harness-reported | profile-priced | tokens-only`. Claude Code reports `total_cost_usd` only for Anthropic-billed runs; for GLM-via-Claude-Code the driver computes cost from usage × profile pricing when present, else records tokens-only and the speed/spend dimension falls back to token counts (already captured) instead of dollars. Normalization handles either consistently within a run since all candidates share the profile.
- **D5 — Probe-before-matrix**: `cli.ts model probe <profile>` runs a 1-token headless session (worker path) and a 1-token SDK/CC call (judge path) and reports auth + protocol health — the same fail-before-spend discipline as sandbox preflight. New profiles also get one smoke trial before matrix use (process rule, documented).

## Risks / Trade-offs

- [Anthropic-compatible endpoints differ subtly (tool-call fidelity, stream-json fields, stop reasons)] → probe + smoke-trial gate (D5); telemetry parser already tolerates missing fields; deviations recorded in provenance notes.
- [GLM coding-plan rate limits/concurrency unknown under matrix load] → existing per-trial wall-clock/cost caps bound damage; start matrices at concurrency 1 on new profiles.
- [Cross-vendor judge bias contaminating comparisons] → D3 flagging; recommended practice documented: compare model stacks using the same judge profile across runs, and treat cross-vendor judged runs as exploratory.
- [Cost comparability across billing models (subscription vs API vs coding-plan)] → costSource labels in results; leaderboard spend column annotates mixed-source aggregations.
- [Secret sprawl] → per-profile envVar names centralized in the registry; `.env.example` and redaction list updated mechanically from it (single source).

## Open Questions

- Exact z.ai model IDs/endpoint paths at implementation time (their docs evolve; verify GLM-5.1 vs glm-4.7 naming against docs.z.ai/devpack/tool/claude).
- Whether the judge default should remain claude-sonnet-4-6 for GLM-worker runs (cross-vendor flag) or a GLM judge should be offered as the matched-vendor option.

# Proposal: Add local-model support (Ollama, LM Studio, HuggingFace)

> Builds on the **`model-registry`** capability (`config/models.yaml`, the
> `ModelProfile`/`ModelTransport`/`AuthKind` types in `src/models.ts`) and the
> **`harness-drivers`** Codex driver (`src/driver/codex.ts`). No new harness is
> added; local models slot into the existing model-profile system.

## Why

Every model the eval can run today is a hosted, billed endpoint (Anthropic,
z.ai, OpenAI, etc.). Operators want to benchmark and **freely mix** local,
self-hosted models against cloud models — local worker + cloud judge, cloud
worker + local judge, or fully local — for zero-marginal-cost experimentation
and to compare open-weight models head-to-head with the same harness and target.

The model system was deliberately built for this: profiles are config, and the
worker/judge model is selected by profile name on the CLI (`--worker-model`,
`--judge-model`) and in Eval Studio. The gap is that (a) no transport reaches a
local OpenAI-compatible server, (b) every `AuthKind` assumes a credential, and
(c) the blind judge hard-codes the Anthropic SDK. This change closes all three.

## What changes

Delivered in three independently shippable phases under one change.

### Phase 1 — Local models as **workers** via Codex's built-in OSS mode

Codex (verified `codex-cli 0.142.0`) ships first-class local-provider support:
`codex exec --oss --local-provider <ollama|lmstudio> --model <id>`. The flags are
built in — no `[model_providers.*]` TOML required. The Codex driver already runs
`codex exec`; it only needs to emit `--oss --local-provider` and skip API-key
login when the worker profile is a local one.

- **`AuthKind` gains `none`** — Ollama/LM Studio need no credential. `resolveWorkerEnv`
  returns no auth env for `none`, and the Codex driver skips the `codex login` step.
- **`ModelProfile` gains optional `ossProvider: "ollama" | "lmstudio"`** — the
  single marker the Codex driver reads to add `--oss --local-provider <value>`.
- **Codex driver** threads `ossProvider` through `resolveWorkerEnv` →
  `PrintCliCommandContext` → `buildCommand`, and omits the auth block for `none`.
- **Example profiles** in `config/models.yaml`: `ollama-qwen3-coder`,
  `ollama-llama3.1`, `lmstudio-default` (all `transport: codex`, `authKind: none`).

**Wire constraint (verified, must be specced):** Codex's built-in Ollama provider
speaks the **OpenAI Responses API** (binary string: "Local Ollama server
(Responses API, default port 11434)"), not Chat Completions, and Codex enforces a
minimum Ollama version ("Codex requires Ollama …"). Phase 1 pins a documented
minimum Ollama version and surfaces Codex's version/connection error in preflight,
rather than failing opaquely mid-trial.

### Phase 2 — Local/remote models as **judges** via an `openai-compat` transport

- **`ModelTransport` gains `openai-compat`** — a profile carrying `baseUrl` +
  `authKind` (`none` local, `api-key` remote) that speaks the OpenAI
  `/v1/chat/completions` API.
- **The blind judge (`src/grading/judge.ts`)** is refactored behind a small
  `JudgeClient` interface so the Anthropic tool-use loop and an OpenAI-compatible
  tool-use loop are separate, testable implementations. The judge selects the
  client by the judge profile's transport. The `record_score` tool is expressed
  in each provider's tool schema.
- **Brittle-tool-calling mitigation:** small local models often fail to emit a
  structured tool call. When no `record_score` call is returned, a text-fallback
  parser extracts `score`/`justification` from freeform output, and the fallback
  is flagged in the grading record so a flaky judge is visible, never silent.

### Phase 3 — HuggingFace, reusing the Phase 2 transport

- **HF Inference Endpoints (dedicated)** and **local TGI/vLLM** both expose an
  OpenAI-compatible `/v1` route → they are `openai-compat` profiles with a
  `baseUrl` and `authKind` (`api-key` with `HF_TOKEN`, or `none` for local TGI).
  **No new code** — example profiles + one end-to-end validation.
- **HF Serverless Inference API is explicitly excluded** (documented, not
  half-supported): cold-starts and rate limits would poison speed/latency
  telemetry and make a fair, budgeted eval impossible.

## Model selection (no new UX)

Local models are selected exactly like every other model — by profile name:
`--worker-model ollama-qwen3-coder --judge-model claude-opus-4-8` mixes a local
worker with a cloud judge. Eval Studio's worker/judge dropdowns read the live
registry, so local profiles appear automatically. The only added feedback is
endpoint **reachability**: `model probe <profile>` and the Studio ping the local
server (`/api/tags` for Ollama, `/v1/models` for LM Studio/TGI) so a stopped
server fails loud and early instead of mid-trial.

## Capabilities

### Modified Capabilities

- `model-registry`: adds the `none` auth kind, the `ossProvider` worker marker
  (Codex OSS mode), the `openai-compat` transport, and local-endpoint
  reachability in the profile probe.
- `grading-rubric`: the code-quality judge gains an `openai-compat` client path
  (with a flagged text-fallback) so local/remote OpenAI-compatible models can
  judge; judge-independence and cross-vendor-flag rules are unchanged.

## Impact

- `src/models.ts`: `AuthKind` += `none`; `ModelTransport` += `openai-compat`;
  `ModelProfile` += optional `ossProvider`; `resolveWorkerEnv` returns
  `ossProvider`; new `resolveOpenAICompatEnv`. `src/driver/types.ts`
  `PrintCliCommandContext` += optional `ossProvider`. `src/driver/codex.ts`
  emits `--oss --local-provider` and skips login for `none`.
- `src/grading/judge.ts`: refactor to a `JudgeClient` interface; add the
  OpenAI-compatible implementation (`openai` SDK) + text fallback. Checkpointing
  is transport-agnostic and unchanged.
- `config/models.yaml`: example local + HF profiles, inline-documented.
  `.env.example` + `src/driver/archive.ts` redaction: `HF_TOKEN`,
  `OLLAMA_BASE_URL`, `LMSTUDIO_BASE_URL` (URLs are not secrets but are documented).
- Trial-image note: a local worker/judge requires the model server reachable from
  the sandbox; documented per provider (worktree/host trivially; container/cloud
  need host-gateway networking or a shipped-in endpoint).
- Cost: local profiles have no pricing → `tokens-only` cost source (the existing
  rule); telemetry stays honest. A cross-vendor local-vs-cloud judge is flagged
  by the existing `judgeWorkerRelation` rule.

## Verification gate (per phase)

Each phase is done only when: `bun run test` is green; `bun run src/cli.ts validate`
passes; `model probe` succeeds against the live endpoint; and one real smoke
trial/grade records provenance with the correct transport, auth kind, and
cost-source. `openspec validate add-local-model-support` passes.

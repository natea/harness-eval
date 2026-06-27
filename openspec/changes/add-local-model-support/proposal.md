# Proposal: Add local-model support (Ollama, LM Studio)

> Builds on the **`model-registry`** capability (`config/models.yaml`, the
> `ModelProfile`/`ModelTransport`/`AuthKind` types in `src/models.ts`) and the
> **`harness-drivers`** Codex driver (`src/driver/codex.ts`). No new harness is
> added; local models slot into the existing model-profile system.

## Why

Every model the eval can run today is a hosted, billed endpoint (Anthropic,
z.ai, OpenAI, etc.). Operators want to benchmark local models with zero marginal
cost, starting with the local runtimes Codex supports directly: Ollama and
LM Studio. The supported mixes for this change are local worker + existing cloud
judge, cloud worker + local Ollama-compatible judge, or fully local worker +
local judge where the runtime exposes the needed endpoint.

The model system was deliberately built for this: profiles are config, and the
worker/judge model is selected by profile name on the CLI (`--worker-model`,
`--judge-model`) and in Eval Studio. The gap is that (a) no transport reaches a
local Ollama/LM Studio worker, (b) every `AuthKind` assumes a credential, and
(c) the blind judge hard-codes the Anthropic SDK. This change closes those gaps
without adding a cloud endpoint surface.

## What changes

Delivered in two independently shippable phases plus local-provider close-out.

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

### Phase 2 — Local models as **judges** via an `openai-compat` transport

- **`ModelTransport` gains `openai-compat`** — a profile carrying `baseUrl` +
  `authKind: none` for local endpoints that speak the OpenAI
  `/v1/chat/completions` API. This is required for Ollama's `/v1` judge path and
  may also be used by a local LM Studio judge profile later.
- **The blind judge** is refactored behind a small `JudgeClient` interface so the
  Anthropic tool-use loop and an OpenAI-compatible tool-use loop are separate,
  testable implementations, selected by the judge profile's transport. The
  `record_score` tool is expressed in each provider's tool schema. This extends the
  **existing `sdk` grading driver** (`src/grading/judge.ts`) — *not* a new driver.
- **Grading-path routing.** Grading defaults to the `cc` driver (Claude Code,
  Anthropic-only; Studio hardcodes it), which is why Codex judges are rejected
  today. An `openai-compat` judge is routed to the `sdk` driver in both Studio
  (`src/studio/run-exec.ts`) and the CLI, and the blanket transport rejection in
  `src/studio/options.ts` is relaxed to reject only judges no driver can drive.
- **Brittle-tool-calling mitigation:** small local models often fail to emit a
  structured tool call. When no `record_score` call is returned, a text-fallback
  parser extracts `score`/`justification` from freeform output, and the fallback
  is flagged in the grading record so a flaky judge is visible, never silent.

### Phase 3 — Local-provider close-out

- **Keep the runtime scope local:** Ollama and LM Studio are the only providers
  advertised by this change. HuggingFace Inference Endpoints, TGI, vLLM, and other
  remote OpenAI-compatible services are deliberately out of scope.
- **Remove unused cloud surface:** no `HF_TOKEN`, no HuggingFace endpoint template,
  no local TGI/vLLM profile, and no validation task that requires an external
  endpoint.
- **Validation focus:** Ollama is live-validated as both worker and judge.
  LM Studio is kept as a local Codex OSS worker profile and must pass
  `model probe lmstudio-default` before operators use it for a run.

## Model selection (no new UX)

Local models are selected exactly like every other model — by profile name:
`--worker-model ollama-qwen3-coder --judge-model claude-opus-4-8` mixes a local
worker with an existing cloud judge, while `--judge-model ollama-gemma4-judge`
uses a local Ollama judge. Eval Studio's worker/judge dropdowns read the live
registry, so local profiles appear automatically. The only added feedback is
endpoint **reachability**: `model probe <profile>` and the Studio ping the local
server (`/api/tags` for Ollama, `/v1/models` for LM Studio and local
OpenAI-compatible judges) so a stopped server fails loud and early instead of
mid-trial.

## Capabilities

### Modified Capabilities

- `model-registry`: adds the `none` auth kind, the `ossProvider` worker marker
  (Codex OSS mode), the local-only `openai-compat` judge transport, and
  local-endpoint reachability in the profile probe.
- `grading-rubric`: the code-quality judge gains an `openai-compat` client path
  (with a flagged text-fallback) so local OpenAI-compatible models can judge;
  judge-independence and cross-vendor-flag rules are unchanged.

## Impact

- `src/models.ts`: `AuthKind` += `none`; `ModelTransport` += `openai-compat`;
  `ModelProfile` += optional `ossProvider`; `resolveWorkerEnv` returns
  `ossProvider`; new `resolveOpenAICompatEnv`. `src/driver/types.ts`
  `PrintCliCommandContext` += optional `ossProvider`. `src/driver/codex.ts`
  emits `--oss --local-provider` and skips login for `none`.
- `config/harnesses.yaml` + `infra/trial-image`: bump the Codex pin from `0.50.0`
  to a version that exposes `--oss --local-provider`, asserted at image build.
- `src/grading/judge.ts` (the `sdk` driver): refactor to a `JudgeClient` interface;
  add the OpenAI-compatible implementation (`openai` SDK) + text fallback.
  Checkpointing is transport-agnostic and unchanged. `src/studio/run-exec.ts` +
  `src/studio/options.ts` + the CLI grading path: route `openai-compat` judges to
  `sdk` and stop rejecting them.
- `src/types.ts`: enrich `CriterionScore` with a per-sample shape carrying
  `usedFallback`; update scorecard/dashboard/studio rendering + result readers.
- `config/models.yaml`: Ollama and LM Studio local profiles, inline-documented.
  `.env.example`: `OLLAMA_BASE_URL`, `LMSTUDIO_BASE_URL` (URLs are not secrets but
  are documented). No HuggingFace/TGI/vLLM profiles or tokens are part of this
  change.
- Trial-image note: a local worker/judge requires the model server reachable from
  the sandbox; documented per provider (worktree/host trivially; container/cloud
  need host-gateway networking or a shipped-in endpoint).
- Cost: local profiles have no pricing → `tokens-only` cost source (the existing
  rule); telemetry stays honest. A cross-vendor local-vs-cloud judge is flagged
  by the existing `judgeWorkerRelation` rule. **Studio fix:**
  `src/studio/run-exec.ts` hardcodes a non-dry run's cost source to
  `harness-reported`; it must use `costSourceForHarness` like the CLI, or a free
  local Codex worker is mislabeled as Anthropic-billed.

## Verification gate (per phase)

Each phase is done only when: `bun run test` is green; `bun run src/cli.ts validate`
passes; `model probe` succeeds against the relevant live local endpoint; and one
real Ollama smoke trial/grade records provenance with the correct transport, auth
kind, and cost-source. `openspec validate add-local-model-support` passes.

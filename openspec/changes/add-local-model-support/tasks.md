# Tasks: Add local-model support (Ollama, LM Studio, HuggingFace)

> Three independently shippable phases. Phase 1 = local **workers** via Codex OSS
> mode; Phase 2 = local/remote **judges** via an `openai-compat` transport; Phase 3
> = HuggingFace, reusing Phase 2. Verified against `codex-cli 0.142.0` — re-verify
> Codex flags against the pinned version in `config/harnesses.yaml` /
> `infra/trial-image` before relying on them. Context for any agent picking this up
> cold: see `design.md` (verified facts) and `proposal.md` (why).
>
> **Phase 1 implementation plan (step-by-step, no-placeholder code):**
> `docs/superpowers/plans/2026-06-24-local-model-phase1.md` — execute it with the
> superpowers:subagent-driven-development or executing-plans skill.

## 1. Phase 1 — local worker via Codex OSS mode
- [ ] 1.0 **Codex version (blocker):** the harness registry pins Codex `0.50.0`
  (`config/harnesses.yaml`), but `--oss --local-provider` was verified on
  `codex-cli 0.142.0`. Bump the Codex `defaultVersion` to a version that exposes
  `--oss`/`--local-provider`, update `infra/trial-image` to install it, and assert
  the flags exist (`codex exec --help`) as part of the image build. No Phase 1 work
  is valid until the pinned Codex actually has these flags.
- [ ] 1.1 `src/models.ts`: add `"none"` to `AuthKind`. **Firm rule:** make
  `authEnv` optional on `ModelProfile`, valid to omit only when `authKind: none`;
  refine that a `none` profile requires no credential and that every non-`none`
  auth kind still names an `authEnv`. Unit test: a `none` profile parses without
  `authEnv` and `resolveWorkerEnv` returns no auth env; a non-`none` profile
  missing `authEnv` is rejected.
- [ ] 1.2 `src/models.ts`: add optional `ossProvider: "ollama" | "lmstudio"` to
  `ModelProfile`; refine that it requires `transport: codex` and implies
  `authKind: none`. Unit test the refinement (valid + rejected cases).
- [ ] 1.3 `src/models.ts`: `resolveWorkerEnv` codex branch returns
  `ossProvider` on `ResolvedWorker` and, for `authKind: none`, no auth env + a
  `note` (`"local oss: <provider>"`).
- [ ] 1.4 Plumbing: add optional `ossProvider` to `PrintCliCommandContext`
  (`src/driver/types.ts`) and thread it from `resolveWorkerEnv` through the run
  setup onto the command context (today `resolveWorkerEnv`'s extra fields don't
  reach `codex.ts buildCommand` — close that gap).
- [ ] 1.5 `src/driver/codex.ts`: when `ctx.ossProvider` is set, emit `--oss
  --local-provider <ctx.ossProvider>` and **skip** the `codex login` auth block;
  leave `--json`/resume/sandbox flags unchanged. Unit test the built command for
  both an OSS profile and a normal API-key profile (no regression).
- [ ] 1.6 Preflight/probe: ping the local server and confirm the named model is
  present — Ollama `GET {OLLAMA_BASE_URL}/api/tags`, LM Studio `GET
  {LMSTUDIO_BASE_URL}/v1/models` — failing fast with endpoint + model + a
  start/pull hint. Pin and document the minimum Ollama version Codex requires.
- [ ] 1.7 `config/models.yaml`: add inline-documented `ollama-qwen3-coder`,
  `ollama-llama3.1`, `lmstudio-default` profiles (`transport: codex`,
  `authKind: none`, `ossProvider` set, no `pricing`).
- [ ] 1.8 `.env.example` + redaction (`src/driver/archive.ts`): add
  `OLLAMA_BASE_URL`, `LMSTUDIO_BASE_URL` (with defaults `http://localhost:11434`,
  `http://localhost:1234`). URLs aren't secrets but document them with the keys.
- [ ] 1.85 **Worker URL behavior (verify-then-document):** confirm whether Codex
  `--oss --local-provider` honors a non-default endpoint (a custom `OLLAMA_BASE_URL`
  / config override) or always uses Codex's built-in `localhost:11434` / `:1234`.
  If overridable, thread the profile/env URL through the driver; if not, the spec +
  example profiles SHALL state that Codex *workers* use Codex's default local ports
  (custom URLs are supported for *judges* via the `openai-compat` `baseUrl`, Phase 2).
- [ ] 1.9 **Studio cost-source parity (gap #6):** `src/studio/run-exec.ts`
  hardcodes `costSource: dryRun ? "tokens-only" : "harness-reported"`, while the CLI
  (`src/cli.ts`) uses `costSourceForHarness(workerProfile, harness.reportsCost)`. A
  local Codex worker is free → must be `tokens-only`, but Studio would mislabel it
  `harness-reported`. Replace the Studio hardcode with the same
  `costSourceForHarness` logic so Studio and CLI agree. (Fixes Codex/zerocode
  mislabeling generally, not just local models.) Add a test.
- [ ] 1.10 Validation: `bun run test` green; `bun run src/cli.ts validate` passes;
  `model probe ollama-qwen3-coder` succeeds against a live Ollama; one real smoke
  worker trial on `--provider worktree --harness codex` records provenance with
  provider `ollama`, `authKind none`, cost-source `tokens-only` — **and the same
  trial run through Studio reports `tokens-only`, not `harness-reported`.**

## 2. Phase 2 — local/remote judge via `openai-compat`
> **Grading-path reality (gap #2):** grading runs through one of two drivers —
> `cc` (`src/grading/cc-driver.ts`, Claude Code headless, the default) or `sdk`
> (`src/grading/judge.ts`, Anthropic SDK). **Both are Anthropic-only**, which is
> why Studio rejects a Codex judge outright (`src/studio/options.ts`). The chosen
> approach is **Option A: extend the existing `sdk` driver** (no new driver) so it
> drives an OpenAI-compatible endpoint; `openai-compat` judges are routed to `sdk`,
> never `cc`.
- [ ] 2.1 `src/models.ts`: add `"openai-compat"` to `ModelTransport` (requires
  `baseUrl`; `authKind` `none` or `api-key`); add `resolveOpenAICompatEnv`
  returning `{ baseUrl, apiKey? }`. Unit tests for both auth kinds.
- [ ] 2.2 `src/grading/judge.ts`: extract the existing Anthropic loop behind a
  `JudgeClient` interface (`AnthropicJudgeClient`), keeping the criterion list,
  temperature 0, scrub, and 3-sample median transport-agnostic above the client.
- [ ] 2.3 Add `OpenAICompatJudgeClient` (`openai` SDK, `new OpenAI({ baseURL,
  apiKey })`) with the `record_score` tool as an OpenAI function. Inside the `sdk`
  driver, select the client by judge-profile transport (anthropic → Anthropic;
  openai-compat → OpenAI). No new `--driver` value.
- [ ] 2.4 **Routing (Studio + CLI):** a judge whose transport is `openai-compat`
  MUST be graded by the `sdk` driver, not `cc`. Update `src/studio/run-exec.ts`
  (currently hardcodes `driver: "cc"`) to pick `sdk` for openai-compat judges, and
  ensure the CLI grading path does the same. Relax `src/studio/options.ts` so it
  rejects only judges no grading driver can drive (the blanket `transport ===
  "codex"` reject becomes "ungradable transport" — `openai-compat` is now gradable).
- [ ] 2.5 **Fallback provenance schema (gap #3):** `CriterionScore.samples` is
  `number[]` today (`src/types.ts`) — no place for fallback info. Add a richer
  per-sample shape (e.g. `sampleDetails: { score, justification, usedFallback }[]`
  alongside or replacing the numeric `samples`), and render `usedFallback` in the
  scorecard / dashboard / studio. Migrate existing readers + tests.
- [ ] 2.6 Text fallback: when a sample returns no `record_score` tool call, parse
  `score`/`justification` from message text; set `usedFallback: true` per sample
  (recorded via 2.5's schema). No parseable score → sample error (not a silent 0).
- [ ] 2.7 Confirm judge-independence still holds: `judgeWorkerRelation` rejects
  judge==worker and flags cross-vendor (local judge vs cloud worker). Add/extend a
  test for a local-judge-vs-cloud-worker cross-vendor flag.
- [ ] 2.8 Validation: `bun run test` green; grade a real archived workspace with
  `--judge-model <local openai-compat profile>` via `bun scripts/grade-trial.ts`
  **and** through a Studio run; grading record shows the openai-compat transport,
  the `sdk` driver, and any fallback usage.

## 3. Phase 3 — HuggingFace (reuses Phase 2)
- [ ] 3.1 `config/models.yaml`: add a dedicated HF Inference Endpoint profile
  (`transport: openai-compat`, `baseUrl` `…endpoints.huggingface.cloud/v1`,
  `authEnv: HF_TOKEN`, `authKind: api-key`) and a local TGI/vLLM profile
  (`authKind: none`), both inline-documented.
- [ ] 3.2 `.env.example` + redaction: add `HF_TOKEN`.
- [ ] 3.3 Extend `model probe` to validate a bearer-auth `/v1/models` endpoint
  (works for HF Endpoints, TGI, vLLM).
- [ ] 3.4 Document in `docs/` the dedicated-vs-serverless distinction and **why HF
  Serverless Inference is excluded** (cold-start + rate limits poison speed/latency
  telemetry under a time budget).
- [ ] 3.5 Validation: one real end-to-end judge run against an HF endpoint (or
  local TGI) with provenance recorded; `bun run test` green.

## 4. Selection UX + close-out
- [ ] 4.1 Eval Studio: confirm local/HF profiles appear in the worker/judge
  dropdowns from the live registry (registry-driven — expect no code change) and
  add a reachability badge from the Phase 1/3 probe.
- [ ] 4.2 `openspec validate add-local-model-support` passes; README/setup notes
  point at the new profiles; mark this change ready to archive.

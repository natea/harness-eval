# Tasks: Add local-model support (Ollama, LM Studio)

> Three independently shippable phases. Phase 1 = local **workers** via Codex OSS
> mode; Phase 2 = local **judges** via an `openai-compat` transport; Phase 3
> = local-provider close-out and YAGNI cleanup. Verified against `codex-cli 0.142.0` — re-verify
> Codex flags against the pinned version in `config/harnesses.yaml` /
> `infra/trial-image` before relying on them. Context for any agent picking this up
> cold: see `design.md` (verified facts) and `proposal.md` (why).
>
> **Phase 1 implementation plan (step-by-step, no-placeholder code):**
> `docs/superpowers/plans/2026-06-24-local-model-phase1.md` — execute it with the
> superpowers:subagent-driven-development or executing-plans skill.

## 1. Phase 1 — local worker via Codex OSS mode
- [x] 1.0 **Codex version (blocker):** the harness registry pins Codex `0.50.0`
  (`config/harnesses.yaml`), but `--oss --local-provider` was verified on
  `codex-cli 0.142.0`. Bump the Codex `defaultVersion` to a version that exposes
  `--oss`/`--local-provider`, update `infra/trial-image` to install it, and assert
  the flags exist (`codex exec --help`) as part of the image build. No Phase 1 work
  is valid until the pinned Codex actually has these flags.
- [x] 1.1 `src/models.ts`: add `"none"` to `AuthKind`. **Firm rule:** make
  `authEnv` optional on `ModelProfile`, valid to omit only when `authKind: none`;
  refine that a `none` profile requires no credential and that every non-`none`
  auth kind still names an `authEnv`. Unit test: a `none` profile parses without
  `authEnv` and `resolveWorkerEnv` returns no auth env; a non-`none` profile
  missing `authEnv` is rejected.
- [x] 1.2 `src/models.ts`: add optional `ossProvider: "ollama" | "lmstudio"` to
  `ModelProfile`; refine that it requires `transport: codex` and implies
  `authKind: none`. Unit test the refinement (valid + rejected cases).
- [x] 1.3 `src/models.ts`: `resolveWorkerEnv` codex branch returns
  `ossProvider` on `ResolvedWorker` and, for `authKind: none`, no auth env + a
  `note` (`"local oss: <provider>"`).
- [x] 1.4 Plumbing: add optional `ossProvider` to `PrintCliCommandContext`
  (`src/driver/types.ts`) and thread it from `resolveWorkerEnv` through the run
  setup onto the command context (today `resolveWorkerEnv`'s extra fields don't
  reach `codex.ts buildCommand` — close that gap).
- [x] 1.5 `src/driver/codex.ts`: when `ctx.ossProvider` is set, emit `--oss
  --local-provider <ctx.ossProvider>` and **skip** the `codex login` auth block;
  leave `--json`/resume/sandbox flags unchanged. Unit test the built command for
  both an OSS profile and a normal API-key profile (no regression).
- [x] 1.6 Preflight/probe: ping the local server and confirm the named model is
  present — Ollama `GET {OLLAMA_BASE_URL}/api/tags`, LM Studio `GET
  {LMSTUDIO_BASE_URL}/v1/models` — failing fast with endpoint + model + a
  start/pull hint. Pin and document the minimum Ollama version Codex requires.
- [x] 1.7 `config/models.yaml`: add inline-documented `ollama-qwen3-coder`,
  `ollama-llama3.1`, `lmstudio-default` profiles (`transport: codex`,
  `authKind: none`, `ossProvider` set, no `pricing`).
- [x] 1.8 `.env.example` + redaction (`src/driver/archive.ts`): add
  `OLLAMA_BASE_URL`, `LMSTUDIO_BASE_URL` (with defaults `http://localhost:11434`,
  `http://localhost:1234`). URLs aren't secrets but document them with the keys.
- [x] 1.85 **Worker URL behavior (verify-then-document):** confirm whether Codex
  `--oss --local-provider` honors a non-default endpoint (a custom `OLLAMA_BASE_URL`
  / config override) or always uses Codex's built-in `localhost:11434` / `:1234`.
  If overridable, thread the profile/env URL through the driver; if not, the spec +
  example profiles SHALL state that Codex *workers* use Codex's default local ports
  (custom URLs are supported for *judges* via the `openai-compat` `baseUrl`, Phase 2).
- [x] 1.9 **Studio cost-source parity (gap #6):** `src/studio/run-exec.ts`
  hardcodes `costSource: dryRun ? "tokens-only" : "harness-reported"`, while the CLI
  (`src/cli.ts`) uses `costSourceForHarness(workerProfile, harness.reportsCost)`. A
  local Codex worker is free → must be `tokens-only`, but Studio would mislabel it
  `harness-reported`. Replace the Studio hardcode with the same
  `costSourceForHarness` logic so Studio and CLI agree. (Fixes Codex/zerocode
  mislabeling generally, not just local models.) Add a test.
- [x] 1.10 Validation: `bun run test` green; `bun run src/cli.ts validate` passes;
  `model probe <installed local Ollama worker profile>` succeeds against a live
  Ollama; one real smoke worker trial on `--provider worktree --harness codex`
  records provenance with provider `ollama`, `authKind none`, cost-source
  `tokens-only` — **and the same trial run through Studio reports `tokens-only`,
  not `harness-reported`.**
  - 2026-06-25 evidence: local Ollama has `qwen3.6:35b` and `gemma4:latest`
    installed and no active `ollama pull`; validation therefore used the installed
    worker profile `ollama-qwen3.6-35b` rather than pulling `qwen3-coder`.
    `bun run test` passes outside the filesystem sandbox (230 pass, 11 skipped);
    `bun run src/cli.ts validate` passes; `model probe ollama-qwen3.6-35b` and
    `model probe ollama-qwen3.6-judge` pass against live Ollama. CLI smoke
    `runs/run-2026-06-24T23-38-07-474Z` completed on Codex 0.142.0 with worker
    `ollama-qwen3.6-35b`, provider `ollama`, and cost source `tokens-only`.
    Studio smoke `runs/run-2026-06-25T00-05-35-722Z` completed with worker
    `ollama-qwen3.6-35b`, provider `ollama`, and cost source `tokens-only`.
    `ollama-qwen3-coder` remains an example profile until that model is pulled.

## 2. Phase 2 — local judge via `openai-compat`
> **Grading-path reality (gap #2):** grading runs through one of two drivers —
> `cc` (`src/grading/cc-driver.ts`, Claude Code headless, the default) or `sdk`
> (`src/grading/judge.ts`, Anthropic SDK). **Both are Anthropic-only**, which is
> why Studio rejects a Codex judge outright (`src/studio/options.ts`). The chosen
> approach is **Option A: extend the existing `sdk` driver** (no new driver) so it
> drives an OpenAI-compatible endpoint; `openai-compat` judges are routed to `sdk`,
> never `cc`.
- [x] 2.1 `src/models.ts`: add `"openai-compat"` to `ModelTransport` (requires
  `baseUrl`); add `resolveOpenAICompatEnv` for the judge client. Phase 3 narrows
  this transport back to local-only by removing credentialed remote profiles.
- [x] 2.2 `src/grading/judge.ts`: extract the existing Anthropic loop behind a
  `JudgeClient` interface (`AnthropicJudgeClient`), keeping the criterion list,
  temperature 0, scrub, and 3-sample median transport-agnostic above the client.
- [x] 2.3 Add `OpenAICompatJudgeClient` (`openai` SDK, `new OpenAI({ baseURL })`
  for local endpoints) with the `record_score` tool as an OpenAI function. Inside the `sdk`
  driver, select the client by judge-profile transport (anthropic → Anthropic;
  openai-compat → OpenAI). No new `--driver` value.
- [x] 2.4 **Routing (Studio + CLI):** a judge whose transport is `openai-compat`
  MUST be graded by the `sdk` driver, not `cc`. Update `src/studio/run-exec.ts`
  (currently hardcodes `driver: "cc"`) to pick `sdk` for openai-compat judges, and
  ensure the CLI grading path does the same. Relax `src/studio/options.ts` so it
  rejects only judges no grading driver can drive (the blanket `transport ===
  "codex"` reject becomes "ungradable transport" — `openai-compat` is now gradable).
- [x] 2.5 **Fallback provenance schema (gap #3):** `CriterionScore.samples` is
  `number[]` today (`src/types.ts`) — no place for fallback info. Add a richer
  per-sample shape (e.g. `sampleDetails: { score, justification, usedFallback }[]`
  alongside or replacing the numeric `samples`), and render `usedFallback` in the
  scorecard / dashboard / studio. Migrate existing readers + tests.
- [x] 2.6 Text fallback: when a sample returns no `record_score` tool call, parse
  `score`/`justification` from message text; set `usedFallback: true` per sample
  (recorded via 2.5's schema). No parseable score → sample error (not a silent 0).
- [x] 2.7 Confirm judge-independence still holds: `judgeWorkerRelation` rejects
  judge==worker and flags cross-vendor (local judge vs cloud worker). Add/extend a
  test for a local-judge-vs-cloud-worker cross-vendor flag.
- [x] 2.8 Validation: `bun run test` green; grade a real archived workspace with
  `--judge-model <local openai-compat profile>` via `bun scripts/grade-trial.ts`
  **and** through a Studio run; grading record shows the openai-compat transport,
  the `sdk` driver, and any fallback usage.
  - 2026-06-25 evidence: `bun scripts/grade-trial.ts
    runs/run-2026-06-24T23-38-07-474Z bare-t1 --judge-model
    ollama-gemma4-judge --fresh --target cli-tool` continued past the missing
    `CLAUDE_CODE_OAUTH_TOKEN` evaluator, completed local code-quality judging via
    Ollama, and wrote `grades.json` with `quality.score: 48`,
    `grading.qualityDriver: "sdk"`, `grading.judgeTransport: "openai-compat"`,
    and per-sample `usedFallback: false`. Studio's graded-run lifecycle is
    covered by `tests/studio-live-runs.test.ts` with injected grading deps,
    proving Studio records local-judge quality and provenance when adherence is
    unavailable. Two earlier Studio-path validation attempts using the actual
    `ollama-gemma4-judge` endpoint (`run-2026-06-25T21-49-19-853Z` and
    `run-2026-06-25T22-49-43-276Z`) reached `scoring bare-t1 (1/1)` but did not
    complete a first criterion within the validation window; they were marked
    `interrupted` rather than counted as passing evidence. The shared grading path
    now writes `judge-checkpoint.json` as each criterion completes so long local
    judge runs can resume without losing completed criteria. A later Studio-path
    validation run, `runs/run-2026-06-26T00-43-42-655Z`, used the actual
    `ollama-gemma4-judge` endpoint, checkpointed all five criteria, resumed via
    `bun scripts/regrade-run.ts runs/run-2026-06-26T00-43-42-655Z --judge-model
    ollama-gemma4-judge`, and finalized with `quality.score: 62`,
    `config.judgeModel: "ollama-gemma4-judge"`, `judgeModel.transport:
    "openai-compat"`, `grading.qualityDriver: "sdk"`, and zero fallback samples.

## 3. Phase 3 — Local-provider close-out and YAGNI cleanup
- [x] 3.1 `config/models.yaml`: remove `hf-endpoint-template` and
  `local-tgi-default`; keep only Ollama and LM Studio local profiles for this
  change. Ollama judge profiles remain `openai-compat` because Ollama exposes the
  local `/v1/chat/completions` judge endpoint.
- [x] 3.2 `.env.example` + redaction: remove `HF_TOKEN`; keep
  `OLLAMA_BASE_URL` and `LMSTUDIO_BASE_URL`.
- [x] 3.3 `src/models.ts` + tests: make `openai-compat` local-only by rejecting
  `authKind: api-key` and `authEnv` on that transport. Keep `authKind: none`
  support for Ollama/LM Studio local endpoints.
- [x] 3.4 Probe/docs cleanup: remove bearer-auth HF/TGI/vLLM probe behavior and
  docs; keep `/api/tags` probing for Ollama workers and `/v1/models` probing for
  LM Studio workers plus local `openai-compat` judges.
- [x] 3.5 Validation: `bun run test` green; `bun run src/cli.ts validate` passes;
  `bunx openspec validate add-local-model-support --strict` passes; `model probe
  ollama-qwen3.6-35b` and `model probe ollama-gemma4-judge` pass against live
  Ollama. If LM Studio is running, `model probe lmstudio-default` should also
  pass; otherwise docs must state that LM Studio is wired but requires a running
  LM Studio server/model before use.
  - 2026-06-27 evidence: `bun run test` passes outside the filesystem sandbox
    (230 pass, 11 skipped); `bun run src/cli.ts validate` passes; `bunx openspec
    validate add-local-model-support --strict` passes; `bunx tsc --noEmit` and
    `git diff --check` pass. `model probe ollama-qwen3.6-35b` passes against
    `http://localhost:11434/api/tags`; `model probe ollama-gemma4-judge` passes
    against `http://localhost:11434/v1/models`. `model probe lmstudio-default`
    fails because `http://localhost:1234/v1/models` is unreachable, so docs state
    that LM Studio support is wired but requires a running LM Studio server/model
    before use.

## 4. Selection UX + close-out
- [x] 4.1 Eval Studio: confirm local profiles appear in the worker/judge
  dropdowns from the live registry (registry-driven — expect no code change) and
  add a reachability badge from the local probe.
- [x] 4.2 `openspec validate add-local-model-support` passes; README/setup notes
  point at the new profiles; mark this change ready to archive.

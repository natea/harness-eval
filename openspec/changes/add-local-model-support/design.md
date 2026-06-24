# Design: Local-model support

This change is intentionally additive to the existing model-profile system. Read
`src/models.ts` (profile schema, `resolveWorkerEnv`, `resolveClaudeCodeEnv`) and
`src/driver/codex.ts` (worker invocation) before implementing — the patterns there
are the template. All facts below were verified against `codex-cli 0.142.0` and the
repo at the time of writing; re-verify flags/strings against the pinned Codex in
`config/harnesses.yaml` / `infra/trial-image` at implementation.

## Verified Codex facts (the load-bearing ones)

- `codex exec --oss --local-provider <lmstudio|ollama> --model <MODEL>` is built in
  (from `codex exec --help`): `--oss` = "Use open-source provider";
  `--local-provider <OSS_PROVIDER>` = "Specify which local provider to use
  (lmstudio or ollama)". **No `[model_providers.*]` TOML is required for these two.**
- Codex's Ollama provider is labelled (binary string) **"Local Ollama server
  (Responses API, default port 11434)"** and LM Studio **"Local LM Studio server
  (default port 1234)"**. So Codex talks the **Responses API** to Ollama — it
  version-gates Ollama ("… is too old. Codex requires Ollama …", "Failed to connect
  to Ollama server: …", "Failed to query local models from Ollama: …"). Phase 1
  must pin a documented minimum Ollama version and surface these errors in preflight.
- Codex authenticates from `$CODEX_HOME/auth.json`, not a bare `OPENAI_API_KEY`
  (see the archived `add-codex-cli-harness` design and the comment in `codex.ts`).
  For a local OSS provider there is **no login step** — the driver must skip it.

## Phase 1 — local worker (Codex OSS mode)

### Codex version (resolved blocker)
`config/harnesses.yaml` pins Codex `0.50.0`; `--oss`/`--local-provider` were
verified on `0.142.0`. Task 1.0 bumps the pin + trial image to a version that
exposes the flags and asserts them at image-build time. Nothing in Phase 1 is
valid until the pinned Codex actually has `--oss --local-provider`.

### Type changes (`src/models.ts`)
- `AuthKind` enum gains `"none"`. **Firm rule (no implementation choice):**
  `authEnv` becomes *optional* on `ModelProfile`; a `none` profile MAY omit it, and
  every non-`none` auth kind MUST still name an `authEnv`. A `none` profile requires
  no credential and `resolveWorkerEnv` injects no auth env for it. Assert both
  directions in the zod refinement + tests.
- `ModelProfile` gains `ossProvider: z.enum(["ollama","lmstudio"]).optional()`.
  Refinement: `ossProvider` is only valid with `transport: codex` and implies
  `authKind: none`.
- `resolveWorkerEnv` (the codex branch) returns the new field on `ResolvedWorker`:
  `ossProvider?: "ollama" | "lmstudio"`. For `authKind: none` it returns no auth
  env and a `note` like `"local oss: ollama"`.

### Plumbing gap to close (called out by review)
`resolveWorkerEnv` today returns only `{ env, modelFlag, note }`, and
`PrintCliCommandContext` (`src/driver/types.ts`) has no field for an OSS provider,
so the value never reaches `codex.ts buildCommand`. The path to wire:
`resolveWorkerEnv` → CLI/run setup passes `ossProvider` onto the run context →
`PrintCliCommandContext` gains optional `ossProvider` → `codex.ts buildCommand`
reads it. This is a real task, not a config tweak.

### Codex driver (`src/driver/codex.ts`)
- When `ctx.ossProvider` is set: add `--oss --local-provider <ctx.ossProvider>` to
  the `codex exec` argv, keep `--model <id>`, and **skip the auth block entirely**
  (no `codex login`). Everything else (file-redirected output, `--json`,
  `--dangerously-bypass-approvals-and-sandbox`, `--skip-git-repo-check`, resume)
  is unchanged. Telemetry parsing (`parseCodexJsonl`) is unchanged.

### Preflight / probe
Before any local-worker trial: ping the server and confirm the named model is
present. Ollama: `GET {OLLAMA_BASE_URL}/api/tags`. LM Studio: `GET
{LMSTUDIO_BASE_URL}/v1/models`. Fail fast with the endpoint + model named, and a
hint to start the server / `ollama pull <model>`. Do not let Codex's version error
appear first inside a trial transcript.

### Example profiles (`config/models.yaml`)
```yaml
- name: ollama-qwen3-coder
  provider: ollama
  modelId: qwen3-coder
  transport: codex
  ossProvider: ollama
  authKind: none
# lmstudio-default likewise with ossProvider: lmstudio, provider: lmstudio
```
No `pricing` → cost source is `tokens-only` (existing rule). `provider` is the
vendor label used by `judgeWorkerRelation` for the cross-vendor flag.

## Phase 2 — local/remote judge (`openai-compat` transport)

### Type changes
- `ModelTransport` gains `"openai-compat"`. Such a profile carries `baseUrl`
  (required) and `authKind` (`none` or `api-key`). Add `resolveOpenAICompatEnv`
  parallel to `resolveClaudeCodeEnv`: returns `{ baseUrl, apiKey? }` for the judge
  client; for `none` no key is read.

### Grading-path reality (gap #2 — must read before coding)
Grading does NOT go through one place. There are two grading drivers, selected by
`grade-trial.ts --driver cc|sdk`:
- **`cc`** (`src/grading/cc-driver.ts`) — Claude Code headless. **The default**, and
  what Studio uses (`src/studio/run-exec.ts` hardcodes `driver: "cc"`). Anthropic-only.
- **`sdk`** (`src/grading/judge.ts`) — the Anthropic SDK. Also Anthropic-only today.

Because `cc` drives Claude Code (Anthropic-only), Studio *rejects* a Codex judge up
front (`src/studio/options.ts`). A local `openai-compat` judge would hit the same
wall. **Decision: Option A — extend the existing `sdk` driver** (no new driver). The
`sdk` driver becomes transport-aware; an `openai-compat` judge is routed to `sdk`,
never `cc`. Studio/CLI must therefore: (1) pick `sdk` when the judge transport is
`openai-compat`, and (2) relax the blanket reject in `options.ts` from "transport
=== codex" to "no grading driver can drive this transport".

### Fallback provenance schema (gap #3)
`CriterionScore.samples` is `z.array(z.number())` today — numbers only, with no slot
for `usedFallback`. To record the fallback honestly, enrich the per-sample shape,
e.g. `sampleDetails: { score: number; justification: string; usedFallback: boolean }[]`
(kept alongside or replacing `samples`), and render `usedFallback` in
scorecard/dashboard/studio. Migrate existing result readers + their tests.

### Judge refactor (`src/grading/judge.ts`)
The `sdk` judge currently constructs `new Anthropic(...)` and runs an Anthropic
tool-use loop calling a `record_score` tool. Introduce:

```
interface JudgeClient {
  // runs one sample for one criterion, returns {score, justification, usedFallback}
  scoreCriterion(opts): Promise<CriterionSample>;
}
```
Two implementations, selected by judge profile transport:
- `AnthropicJudgeClient` — the existing path, extracted unchanged.
- `OpenAICompatJudgeClient` — `new OpenAI({ baseURL, apiKey })`, the `record_score`
  tool expressed as an OpenAI `tools`/`tool_calls` function. Same criterion list,
  same temperature 0, same 3-sample median (those live above the client and stay
  transport-agnostic, so the median/scrub/independence rules are untouched).

**Text fallback:** if a sample returns no tool call, parse `score`/`justification`
from the message text (tolerant: a `0-10` integer + the surrounding rationale). Set
`usedFallback: true`; record it per sample so the grading record shows when a weak
local judge didn't tool-call. If neither a tool call nor a parseable score is
found, the sample is an error (existing error handling), not a silent 0.

### Independence / bias (unchanged, restated for the spec)
Judge ≠ worker is enforced by `judgeWorkerRelation` (by profile name). A local
judge against a cloud worker (or vice-versa) is cross-vendor → the existing
flag/caveat fires. Scrub-before-judge and median-of-three are unchanged.

## Phase 3 — HuggingFace (reuses Phase 2)

- **HF Inference Endpoints (dedicated):** `transport: openai-compat`, `baseUrl:
  https://<id>.endpoints.huggingface.cloud/v1`, `authEnv: HF_TOKEN`,
  `authKind: api-key`.
- **Local TGI / vLLM:** identical but `baseUrl: http://localhost:8080/v1`,
  `authKind: none`. Same as Ollama/LM Studio from the judge's view.
- **Serverless Inference API: excluded**, documented in `docs/`. Reason: cold-start
  + rate limits make latency/speed telemetry meaningless under a time budget. This
  is a deliberate YAGNI cut, recorded so it reads as a decision, not an omission.
- Work is: two example profiles, extend `model probe` to validate a bearer-auth
  `/v1/models`, one live end-to-end judge run, and the docs note.

## Selection surfaces (no new mechanics)
- **CLI:** `--worker-model` / `--judge-model` already take any profile name.
- **`config/models.yaml`:** the catalog; add a model = add a profile, no code.
- **Eval Studio:** worker/judge dropdowns read the live registry; local profiles
  appear automatically. Add a reachability badge from the same probe.
- **`model probe <profile>`:** extended for `none`-auth local endpoints.

## Things deliberately NOT done (YAGNI)
- No custom `[model_providers.*]` TOML writer for Phase 1 — `--oss
  --local-provider` covers Ollama + LM Studio without it. (A custom TOML provider
  is a later option only if a non-OSS local endpoint must be driven *through Codex*;
  the `openai-compat` judge path already covers OpenAI-compatible servers for
  judging.)
- No HF Serverless support (see Phase 3).
- No new auth storage — local `none` needs none; `HF_TOKEN`/keys stay env-only and
  redacted.

## Open questions (resolve at implementation)
- Exact minimum Ollama version Codex 0.142.0 requires (read it from the error
  string / Codex release notes; pin it in the preflight + docs).
- Whether `--model` for the OSS path takes the bare model name or a
  `provider/model` form — confirm with a probe before writing example profiles.
- Container/cloud reachability to a host model server (host-gateway vs shipped-in);
  document per provider, default the examples to worktree/host runs.

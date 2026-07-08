# Design: Local-model support

This change is intentionally additive to the existing model-profile system. Read
`src/models.ts` (profile schema, `resolveWorkerEnv`, `resolveClaudeCodeEnv`) and
`src/driver/codex.ts` (worker invocation) before implementing — the patterns there
are the template. All facts below were verified against `codex-cli 0.142.0` and the
repo at the time of writing; re-verify flags/strings against the pinned Codex in
`config/harnesses.yaml` / `infra/trial-image` at implementation.

## Verified Codex facts (the load-bearing ones)

- `codex exec --oss --local-provider ollama --model <MODEL>` is built in
  (from `codex exec --help`): `--oss` = "Use open-source provider";
  `--local-provider <OSS_PROVIDER>` = "Specify which local provider to use
  (lmstudio or ollama)". **No `[model_providers.*]` TOML is required for Ollama.**
- Codex's Ollama provider is labelled (binary string) **"Local Ollama server
  (Responses API, default port 11434)"**. Codex talks the **Responses API** to Ollama — it
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
- `ModelProfile` gains `ossProvider: z.literal("ollama").optional()`.
  Refinement: `ossProvider` is only valid with `transport: codex` and implies
  `authKind: none`.
- `resolveWorkerEnv` (the codex branch) returns the new field on `ResolvedWorker`:
  `ossProvider?: "ollama"`. For `authKind: none` it returns no auth
  env and a `note` like `"local oss: ollama"`.

### Plumbing gap to close (called out by review)
`resolveWorkerEnv` today returns only `{ env, modelFlag, note }`, and
`PrintCliCommandContext` (`src/driver/types.ts`) has no field for an OSS provider,
so the value never reaches `codex.ts buildCommand`. The path to wire:
`resolveWorkerEnv` → CLI/run setup passes `ossProvider` onto the run context →
`PrintCliCommandContext` gains optional `ossProvider` → `codex.ts buildCommand`
reads it. This is a real task, not a config tweak.

### Codex driver (`src/driver/codex.ts`)
- When `ctx.ossProvider` is set: add `--oss --local-provider ollama` to
  the `codex exec` argv, keep `--model <id>`, and **skip the auth block entirely**
  (no `codex login`). Everything else (file-redirected output, `--json`,
  `--dangerously-bypass-approvals-and-sandbox`, `--skip-git-repo-check`, resume)
  is unchanged. Telemetry parsing (`parseCodexJsonl`) is unchanged.

### Preflight / probe
Before any local-worker trial: ping the server and confirm the named model is
present. Ollama: `GET {OLLAMA_BASE_URL}/api/tags`. Fail fast with the endpoint +
model named, and a hint to start the server / `ollama pull <model>`. Do not let
Codex's version error appear first inside a trial transcript.

### Example profiles (`config/models.yaml`)
```yaml
- name: ollama-qwen3-coder
  provider: ollama
  modelId: qwen3-coder
  transport: codex
  ossProvider: ollama
  authKind: none
```
No `pricing` → cost source is `tokens-only` (existing rule). `provider` is the
vendor label used by `judgeWorkerRelation` for the cross-vendor flag.

## Phase 2 — local judge (`openai-compat` transport)

### Type changes
- `ModelTransport` gains `"openai-compat"`. Such a profile carries `baseUrl`
  (required) and `authKind: none`. Add `resolveOpenAICompatEnv` parallel to
  `resolveClaudeCodeEnv`: returns `{ baseUrl }` for the judge client. Remote
  OpenAI-compatible endpoints and bearer-token auth are deliberately out of scope
  for this change.

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

Design decision (2026-06-25): the PRD-adherence evaluator and the blind
code-quality judge are allowed to complete independently. `openai-compat` local
judges drive code-quality through the transport-aware `sdk` path; the adaptive
PRD evaluator remains Claude-Code-backed. If the evaluator is unavailable (for
example no `CLAUDE_CODE_OAUTH_TOKEN`), grading records `adherence: null` but still
scrubs the workspace, runs the local quality judge, and writes driver/transport
provenance in `grades.json`.

Design decision (2026-06-25): judge clients resolve the blind workspace to an
absolute path before prompting or running shell tools. Tool calls still execute
with the blind workspace as `cwd`, but the absolute path avoids local models
constructing invalid nested paths when they copy the workspace path from the
prompt.

Design decision (2026-06-25): shared Studio/CLI grading writes
`judge-checkpoint.json` after each quality criterion, matching the post-hoc
`grade-trial.ts` recovery behavior. Local judge runs can be materially slower than
hosted judges, so criterion-level checkpointing is part of the reliability
contract rather than a debugging convenience.

Design decision (2026-06-26): run recovery must preserve the selected judge
profile. `regrade-run.ts` accepts `--judge-model` and otherwise infers the prior
results' judge profile; `finalize-run.ts` preserves or resolves the same profile
so `results.config.judgeModel` and the top-level `judgeModel` provenance cannot
contradict each other.

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

## Phase 3 — local-provider close-out

- **Keep Ollama only.** Ollama is the only local worker runtime advertised by this
  change.
- **Keep local `openai-compat` only for judging.** Ollama's `/v1` endpoint uses the
  same Chat Completions shape as the OpenAI SDK expects, so the local judge path
  stays behind the `openai-compat` transport. The supported auth kind is `none`.
- **Remove LM Studio and HF/TGI/vLLM.** LM Studio, HuggingFace Inference
  Endpoints, local TGI, vLLM, bearer auth, and `HF_TOKEN` are out of scope. LM
  Studio was probed successfully but deferred because Codex worker execution
  failed against LM Studio's OpenAI-compatible tool schema.
- **Validation expectation.** Ollama has live worker and judge evidence.

## Selection surfaces (no new mechanics)
- **CLI:** `--worker-model` / `--judge-model` already take any profile name.
- **`config/models.yaml`:** the catalog; add a model = add a profile, no code.
- **Eval Studio:** worker/judge dropdowns read the live registry; local profiles
  appear automatically. Add a reachability badge from the same probe.
- **`model probe <profile>`:** extended for `none`-auth local endpoints.

## Things deliberately NOT done (YAGNI)
- No custom `[model_providers.*]` TOML writer for Phase 1 — `--oss
  --local-provider` covers Ollama without it. (A custom TOML provider
  is a later option only if a non-OSS local endpoint must be driven *through Codex*;
  the local `openai-compat` judge path already covers Ollama-compatible judging.)
- No HuggingFace Inference Endpoints, HF Serverless, TGI, or vLLM support in this
  change. Those can be introduced by a later OpenSpec change if there is a real
  operator need.
- No new auth storage — local `none` needs no credential.

## Open questions (resolve at implementation)
- Exact minimum Ollama version Codex 0.142.0 requires (read it from the error
  string / Codex release notes; pin it in the preflight + docs).
- Whether `--model` for the OSS path takes the bare model name or a
  `provider/model` form — confirm with a probe before writing example profiles.
- Container/cloud reachability to a host model server (host-gateway vs shipped-in);
  document per provider, default the examples to worktree/host runs.

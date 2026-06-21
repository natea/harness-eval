# Tasks: Add the Codex CLI harness

> Builds on `harness-drivers` (applied).

## 1. Driver
- [x] 1.1 Implement the Codex CLI `HarnessDriver` for the `codex` `HarnessId`
  (`src/driver/codex.ts`: headless `codex exec` via the shared print-cli runner +
  telemetry parse) and register it in the driver registry (`src/driver/index.ts`).
- [x] 1.2 Model/provider config (model-agnostic): worker model passed to
  `codex exec --model`; auth via `codex login --with-api-key` into an isolated
  `CODEX_HOME`; `codex` transport + env resolution wired in the CLI; OpenAI profile
  added to `config/models.yaml`. (Non-OpenAI `model_providers`/`--oss` is the noted
  follow-up; OpenAI-provider path implemented.)
- [x] 1.4 Auth modes: the driver supports (a) api-key (`codex login
  --with-api-key`), (b) **ChatGPT OAuth** — copies the operator's `~/.codex`
  login into the trial's isolated `CODEX_HOME` (profile `codex-oauth`, no API
  billing), and (c) ambient sign-in. A ChatGPT account rejects an explicit
  `--model`, so oauth/default profiles omit it.
- [x] 1.3 Map `codex exec --json` to `SessionRecord` (thread_id→sessionId, turns,
  usage, agent_message→resultText); cost-source per the harness-driver rule
  (codex reports no $ → profile-priced / tokens-only). Verified against REAL codex
  0.139.0 output.
- [x] 1.5 Transcript replay: `transcript-render` detects the codex `exec --json`
  format and maps its events (reasoning→thinking, command_execution/file_change→
  tool_use+result, agent_message→assistant, turn.completed→result) to the shared
  `Turn[]`, so the studio Conversation tab + `conversation.md` render codex builds
  (was blank). Verified on the real OAuth-run transcript (36 turns).

## 2. Image + registry
- [x] 2.1 Pin `@openai/codex` in `infra/trial-image/Dockerfile` with a version assert.
- [x] 2.2 Add a `codex:` harness block (the `codex-baseline` candidate) to
  `config/registry.yaml`; add `OPENAI_API_KEY` to `.env.example` + the archiver
  redaction patterns (`SECRET_ENV_VARS` + `sk-proj-` pattern).

## 3. Contract conformance
- [x] 3.1 Add a Codex conformance fixture (`tests/fixtures/driver-output/codex.jsonl`)
  and a case in the driver-contract test suite; the Codex driver passes it (12/12).

## 4. Validation
- [x] 4.1 Probe: `codex exec` 1-shot returns output — verified (real `codex exec`
  built and ran `hello.py` printing the expected text).
- [x] 4.2 Harness-ORCHESTRATED smoke — verified end-to-end with a SUCCESSFUL
  build. `cli.ts run --candidates codex-baseline --harness codex --worker-model
  codex-oauth --provider worktree --target notes` ran the full path (orchestrator
  → codex driver → `codex exec` via ChatGPT OAuth → telemetry →
  provenance/results/scorecard). The trial built a contract-aligned notes service
  (server.js: unlock + auth-gated CRUD + search + derived title/preview + UTC
  updatedAt), `isError: false`, real usage (185767 in / 4929 out / 148608 cache).
  Provenance recorded `harness: codex@0.50.0` + `workerModel`; cost-source
  recorded; `parseCodexJsonl` parsed the real stream. (`OPENAI_API_KEY` is now in
  `.env` for the api-key path too; the api-key build is the same command with
  `--worker-model gpt-5-codex`.)
- [x] 4.3 `bun run test` green (incl. the driver-contract suite);
  `openspec validate add-codex-cli-harness --strict` passes.

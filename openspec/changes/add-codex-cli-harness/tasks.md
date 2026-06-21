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
- [x] 1.3 Map `codex exec --json` to `SessionRecord` (thread_id→sessionId, turns,
  usage, agent_message→resultText); cost-source per the harness-driver rule
  (codex reports no $ → profile-priced / tokens-only). Verified against REAL codex
  0.139.0 output.

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
- [~] 4.2 Full harness-ORCHESTRATED smoke (provenance + telemetry via `cli.ts run
  --harness codex`) — DEFERRED: needs `OPENAI_API_KEY` (1Password/`op` session
  blocked) and is REAL SPEND. The driver itself is proven end-to-end: a direct
  `codex exec` build smoke succeeded AND `parseCodexJsonl` parsed that real output
  correctly (sessionId, 1 turn, usage 35293/76/22272, final message). Run when the
  key is available: `bun run src/cli.ts run --candidates codex-baseline --harness
  codex --worker-model gpt-5-codex --trials 1 --provider worktree --target notes`.
- [x] 4.3 `bun run test` green (incl. the driver-contract suite);
  `openspec validate add-codex-cli-harness --strict` passes.

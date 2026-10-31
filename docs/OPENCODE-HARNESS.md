# OpenCode Harness

OpenCode ([opencode.ai](https://opencode.ai), `anomalyco/opencode`) is an
open-source, model-agnostic terminal coding agent. It is driven headlessly with
`opencode run`; this is the harness axis of the layer model — a peer of Claude
Code, Codex, and zerocode, not a framework like Superpowers/GSD.

> Verified against the v2 CLI (`@opencode/cli` 2.x) and its
> `packages/cli/src/run/noninteractive.ts` event emitter. Re-verify the event
> shapes when re-pinning `OPENCODE_VERSION`.

## Install

Pinned in `infra/trial-image/Dockerfile`:

```dockerfile
ARG OPENCODE_VERSION=2.2.5
RUN npm install -g @opencode/cli@${OPENCODE_VERSION} && opencode --version
```

Keep the Dockerfile ARG and `config/harnesses.yaml` `defaultVersion` in lockstep.
Build the trial image as usual (`docker build -t harness-eval-trial:zerocode
infra/trial-image/` — one shared image carries every harness CLI).

## How the driver works

`src/driver/opencode.ts` runs one sandbox command per session step:

```sh
export OPENCODE_DISABLE_AUTOUPDATE=1; \
opencode run --model "anthropic/claude-opus-4-6" --format json --auto \
  [--session "<id>"] "$(cat /tmp/he-prompt-<slot>.txt)" > /tmp/he-out-<slot>.jsonl 2>&1
```

- **Model id**: OpenCode wants models.dev `provider/model`. The driver maps a
  bare `claude-*` to `anthropic/…`, a bare `gpt-*`/`o*` to `openai/…`, and leaves
  an explicit `provider/model` untouched.
- **Auth**: provider-conventional env vars (`ANTHROPIC_API_KEY`,
  `OPENAI_API_KEY`, …). Use the `opencode-*` model profiles in
  `config/models.yaml`; the shared `resolveWorkerEnv` injects the profile's
  `authEnv` value. Credentials are env-only and never written to the workspace.
- **Approvals**: `--auto` auto-approves permissions not explicitly denied —
  acceptable only because every trial runs in a disposable sandbox.
- **Resume**: `--session <id>` (the id appears on every event line) for gate
  continuations and later scripted steps.

## Telemetry

`--format json` emits one NDJSON event per line: `step_start`, `text`,
`tool_use`, `step_finish`, `error` (`{type, timestamp, sessionID, part}`).

- `sessionID` (top level) → `SessionRecord.sessionId`.
- `step_finish` ends one model step → `numTurns`; `part.cost` is
  models.dev-priced USD; `part.tokens.{input,output}` plus
  `part.tokens.cache.{read,write}` → `TokenUsage`.
- The text parts are concatenated as `resultText` for gate detection.
- No `step_finish` and no `error` → `SessionParseError` (candidate-side, not
  infra).

OpenCode reports USD, so `reportsCost` stays true. The shared cost classifier
only trusts harness dollars for native Anthropic profiles; on other providers the
run records `profile-priced`/`tokens-only` instead.

## Running

```sh
# 1) Cheap probe on a disposable sandbox
bun run src/cli.ts run --candidates bare --harness opencode \
  --worker-model opencode-claude-sonnet-4-5 --provider docker --trials 1 \
  --trial-minutes 5

# 2) Harness-vs-harness smoke (same model, same target)
bun run src/cli.ts run --candidates bare --harness claude-code \
  --worker-model claude-sonnet-4-6 --provider docker --trials 1 --target symphony-daemon
bun run src/cli.ts run --candidates bare --harness opencode \
  --worker-model opencode-claude-sonnet-4-5 --provider docker --trials 1 --target symphony-daemon
```

Only `bare` (and any candidate that explicitly declares an `opencode:` section)
is selectable on this harness. OpenCode needs an image-backed provider
(`docker`, `daytona`, `e2b`, `macos-vz`); the `worktree` provider is rejected
because the host has no pinned OpenCode CLI.

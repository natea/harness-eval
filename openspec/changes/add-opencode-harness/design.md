# Design: OpenCode harness driver

Builds on `add-pluggable-harnesses`. Verified against the v2 CLI event emitter.

## Install / run

Pin `@opencode/cli` (npm) in `infra/trial-image`. Headless:
`opencode run --format json --auto [--session <id>] "$(cat <prompt-file>)"` in
the workspace cwd. No TUI. Output is redirected to a file and read in a separate
exec, so a service started by the agent cannot hold the capture open.

## Model + auth

OpenCode model ids are models.dev `provider/model`. The driver maps bare ids
(`claude-*` → `anthropic/…`, `gpt-*` → `openai/…`) and passes explicit
`provider/model` ids through. Auth is the provider-conventional env var named by
the model profile's `authEnv` (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, …); a new
`opencode` transport in `src/models.ts` injects it.

## Telemetry

NDJSON events `{type, timestamp, sessionID, part}`:

- `step_finish` → one turn, `part.cost` (USD), `part.tokens.{input,output}` and
  `part.tokens.cache.{read,write}`.
- `text` → concatenated final text.
- `error` → errored record.
- No terminal event → `SessionParseError` (candidate-side).

## Cost source

OpenCode reports USD, so `reportsCost: true`. The run-level classifier only
trusts harness dollars for native Anthropic profiles; third-party profiles fall
back to profile pricing or tokens-only.

## Open questions

- Re-verify the exact event shapes when re-pinning `@opencode/cli`.

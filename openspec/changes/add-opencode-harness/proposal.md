# Proposal: Add OpenCode as an evaluatable harness

> Depends on **`add-pluggable-harnesses`** (the `HarnessDriver` contract +
> dispatch-by-`HarnessId`). This change contributes one driver.

## Why

[OpenCode](https://opencode.ai) is a widely used open-source, model-agnostic
terminal coding agent. Adding it lets the eval compare a popular non-vendor
harness against Claude Code, Codex, and zerocode on the same worker model, which
keeps the harness as the only varying factor.

## What Changes

- **Add `opencode` to `HarnessId`** and register an **OpenCode `HarnessDriver`**:
  - **Install**: pinned `@opencode/cli` (npm) in the trial image,
    version-asserted.
  - **Headless run**: `opencode run --format json --auto` against the rendered
    base prompt in the workspace; continuation via `--session <id>`.
  - **Model + auth**: models.dev `provider/model` (the driver prefixes bare
    `claude-*`/`gpt-*` ids) and the provider-conventional env key from the model
    registry (`authEnv`).
  - **Telemetry**: parse the NDJSON event stream (`step_start`/`text`/
    `tool_use`/`step_finish`/`error`) into `SessionRecord`; per-step
    models.dev-priced USD `cost`, token and cache counts from `step_finish`.
- **Candidate-registry**: candidates may add an `opencode:` harness block; `bare`
  declares one so a harness-vs-harness comparison is available out of the box.

## Capabilities

### Modified Capabilities

- `harness-drivers`: adds the OpenCode driver (install + headless
  `opencode run` + telemetry mapping) to the pluggable harness set.

## Impact

- `HarnessId` gains `opencode`; new driver under `src/driver/`; trial image
  gains a pinned `@opencode/cli`.
- New model transport `opencode` plus an `opencode-claude-sonnet-4-5` profile;
  `authEnv` values are env-only (no new secret name).
- Image-only harness: the `worktree` provider is rejected; preflight probes the
  pinned CLI.
- Before matrix use: a cheap probe (`opencode run` 1-shot) + one smoke trial,
  same discipline as new providers/models.

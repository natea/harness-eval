# Proposal: Add Qwen Code as an evaluatable harness

> Depends on **`add-pluggable-harnesses`** (the `HarnessDriver` contract +
> dispatch-by-`HarnessId`). This change contributes one driver.

## Why

[Qwen Code](https://github.com/QwenLM/qwen-code) is Alibaba's open-source
terminal coding agent (a Gemini-CLI fork). Adding it lets the eval compare a
Qwen-stack harness against Claude Code, Codex, OpenCode, and zerocode, and gives
the eval a harness that can drive Qwen models through an OpenAI-compatible
endpoint.

## What Changes

- **Add `qwen-code` to `HarnessId`** and register a **Qwen Code `HarnessDriver`**:
  - **Install**: pinned `@qwen-code/qwen-code` (npm) in the trial image,
    version-asserted.
  - **Headless run**: `qwen -p "<prompt>" --output-format stream-json --yolo`
    against the workspace; continuation via `--resume <sessionId>`.
  - **Model + auth**: OpenAI-compatible env (`OPENAI_API_KEY`,
    `OPENAI_BASE_URL`) from the model registry; the `qwen3-coder-openai`
    profile targets DashScope's compatible-mode endpoint.
  - **Telemetry**: parse the Claude-shaped stream-json (`system` / `assistant` /
    `result`) into `SessionRecord`; Qwen reports tokens but no USD, so cost is
    `profile-priced` or `tokens-only`.
- **Candidate-registry**: candidates may add a `qwen-code:` harness block; `bare`
  declares one.

## Fairness note (harness↔model confound)

Qwen Code is optimized for Qwen models. A comparison against a Claude-model
harness confounds harness and model; record it as a harness+model comparison,
not a pure harness comparison.

## Capabilities

### Modified Capabilities

- `harness-drivers`: adds the Qwen Code driver (install + headless `qwen -p` +
  telemetry mapping) to the pluggable harness set.

## Impact

- `HarnessId` gains `qwen-code`; new driver under `src/driver/`; trial image
  gains a pinned `@qwen-code/qwen-code`.
- New model transport `qwen` plus a `qwen3-coder-openai` profile reusing the
  existing `DASHSCOPE_API_KEY` (no new secret name).
- Image-only harness: the `worktree` provider is rejected; preflight probes the
  pinned CLI.
- Before matrix use: a cheap probe (`qwen -p` 1-shot) + one smoke trial.

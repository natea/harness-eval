# Qwen Code Harness

[Qwen Code](https://github.com/QwenLM/qwen-code) (`@qwen-code/qwen-code`) is
Alibaba's open-source terminal coding agent, a fork of the Gemini CLI. It is
driven headlessly with `qwen -p`; this is the harness axis of the layer model —
a peer of Claude Code, Codex, OpenCode, and zerocode.

> Verified against `@qwen-code/qwen-code` 0.26.x. Re-verify the flags and the
> `result` payload when re-pinning `QWEN_CODE_VERSION`.

## Install

Pinned in `infra/trial-image/Dockerfile`:

```dockerfile
ARG QWEN_CODE_VERSION=0.26.4
RUN npm install -g @qwen-code/qwen-code@${QWEN_CODE_VERSION} && qwen --version
```

Keep the Dockerfile ARG and `config/harnesses.yaml` `defaultVersion` in lockstep.

## How the driver works

`src/driver/qwen.ts` runs one sandbox command per session step:

```sh
qwen --prompt "$(cat /tmp/he-prompt-<slot>.txt)" --output-format stream-json \
  --yolo --model "qwen3-coder-plus" [--resume "<id>"] > /tmp/he-out-<slot>.jsonl 2>&1
```

- **Auth**: Qwen Code is OpenAI-compatible and reads `OPENAI_API_KEY` +
  `OPENAI_BASE_URL`. The `qwen` model transport in `src/models.ts` maps the
  profile's `authEnv` + `baseUrl` onto those vars. Use the
  `qwen3-coder-openai` profile (DashScope compatible-mode endpoint).
- **Approvals**: `--yolo` auto-approves every tool call — acceptable only
  because every trial runs in a disposable sandbox.
- **Resume**: `--resume <sessionId>` for gate continuations and later steps.

## Telemetry

`--output-format stream-json` emits Claude-shaped line-delimited JSON:
`system` (session start), `assistant` messages, and a final `result`.

- `session_id` (on any line) → `SessionRecord.sessionId`.
- `result.duration_ms`, `result.num_turns` → duration/turns (falls back to the
  assistant-message count).
- `result.usage` (`input_tokens`, `output_tokens`,
  `cache_read_input_tokens`, `cache_creation_input_tokens`) → `TokenUsage`.
- `result.result` → `resultText`; `result.is_error` → error flag.
- No `result` line → `SessionParseError` (candidate-side, not infra).

Qwen Code reports tokens but no billed USD, so `reportsCost: false`. Run cost is
`profile-priced` (if the profile has pricing) or `tokens-only` — never a
fabricated harness figure.

## Running

```sh
# 1) Cheap probe on a disposable sandbox
bun run src/cli.ts run --candidates bare --harness qwen-code \
  --worker-model qwen3-coder-openai --provider docker --trials 1 --trial-minutes 5

# 2) Harness-vs-harness smoke (same model, same target)
bun run src/cli.ts run --candidates bare --harness qwen-code \
  --worker-model qwen3-coder-openai --provider docker --trials 1 --target symphony-daemon
```

Only `bare` (and candidates that explicitly declare a `qwen-code:` section) is
selectable. Qwen Code needs an image-backed provider; `worktree` is rejected
because the host has no pinned Qwen Code CLI.

A fair head-to-head holds the model constant. Because Qwen Code runs Qwen
models, comparing it against a Claude-model harness is a **harness+model**
comparison, not a pure harness comparison — record that caveat in the scorecard.

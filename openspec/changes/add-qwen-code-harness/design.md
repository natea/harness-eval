# Design: Qwen Code harness driver

Builds on `add-pluggable-harnesses`. Verified against the 0.26.x CLI surface.

## Install / run

Pin `@qwen-code/qwen-code` (npm) in `infra/trial-image`. Headless:
`qwen -p "<prompt>" --output-format stream-json --yolo [--resume <id>]` in the
workspace cwd. Output is redirected to a file and read in a separate exec, so a
service started by the agent cannot hold the capture open.

## Model + auth

Qwen Code is OpenAI-compatible and reads `OPENAI_API_KEY` + `OPENAI_BASE_URL`.
A new `qwen` transport in `src/models.ts` maps the profile's `authEnv` and
`baseUrl` onto those vars. The `qwen3-coder-openai` profile uses DashScope's
compatible-mode endpoint (`/compatible-mode/v1`) with `DASHSCOPE_API_KEY`.

## Telemetry

Claude-shaped stream-json:

- `result.duration_ms`, `result.num_turns` (fallback: assistant-message count).
- `result.usage.{input_tokens,output_tokens,cache_read_input_tokens,cache_creation_input_tokens}`.
- `result.result` → final text; `result.is_error` → error flag.
- No `result` → `SessionParseError` (candidate-side).

## Cost source

Qwen Code reports no USD, so `reportsCost: false`; cost is profile-priced (if the
profile declares pricing) or tokens-only.

## Open questions

- Re-verify flags and the result payload when re-pinning the CLI.

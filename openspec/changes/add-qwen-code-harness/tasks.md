# Tasks: Add the Qwen Code harness

> Requires `add-pluggable-harnesses`.

## 1. Driver

- [x] 1.1 Add `qwen-code` to `HarnessId`; implement the Qwen Code
  `HarnessDriver` (headless `qwen -p --output-format stream-json` + telemetry
  parse) under `src/driver/`.
- [x] 1.2 OpenAI-compatible model/auth config from the model registry; resume via
  `--resume`.

## 2. Image + registry

- [x] 2.1 Pin `@qwen-code/qwen-code` in `infra/trial-image` with a version
  assert.
- [x] 2.2 Add a `qwen-code:` harness block to the `bare` candidate; add the
  `qwen` transport + `qwen3-coder-openai` model profile.

## 3. Validation

- [x] 3.1 Driver unit tests: stream-json parsing, command shape, resume, registry
  resolution, cost classification; contract fixture registered.
- [x] 3.2 `bun run src/cli.ts validate` + `bun run test` green.
- [ ] 3.3 Probe: a 1-shot `qwen -p` returns output on the configured model
  (requires the rebuilt trial image and a live DashScope key).
- [ ] 3.4 One smoke trial end-to-end; provenance records harness `qwen-code` +
  version; telemetry + cost-source recorded.

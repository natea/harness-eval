# Tasks: Add the OpenCode harness

> Requires `add-pluggable-harnesses`.

## 1. Driver

- [x] 1.1 Add `opencode` to `HarnessId`; implement the OpenCode `HarnessDriver`
  (headless `opencode run --format json` + telemetry parse) under `src/driver/`.
- [x] 1.2 Model/auth config (models.dev `provider/model` + `authEnv`) from the
  model registry; resume via `--session`.

## 2. Image + registry

- [x] 2.1 Pin `@opencode/cli` in `infra/trial-image` with a version assert.
- [x] 2.2 Add an `opencode:` harness block to the `bare` candidate; add the
  `opencode` transport + `opencode-claude-sonnet-4-5` model profile.

## 3. Validation

- [x] 3.1 Driver unit tests: event parsing, command shape, resume, registry
  resolution, cost reporting; contract fixture registered.
- [x] 3.2 `bun run src/cli.ts validate` + `bun run test` green.
- [ ] 3.3 Probe: a 1-shot `opencode run` returns output on the configured model
  (requires the rebuilt trial image and a live credential).
- [ ] 3.4 One smoke trial end-to-end; provenance records harness `opencode` +
  version; telemetry + cost-source recorded.

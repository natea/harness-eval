# Tasks: Add the Kiro CLI harness

> Requires `add-pluggable-harnesses`.

## 1. Driver

- [x] 1.1 Add `kiro` to `HarnessId`; implement the Kiro CLI `HarnessDriver`
  (headless `kiro-cli chat --output-format stream-json` + telemetry parse) under
  `src/driver/`.
- [x] 1.2 Model/auth config (`KIRO_API_KEY` + `--model`) from the model
  registry; resume via `--resume-id`.

## 2. Image + registry

- [x] 2.1 Pin the Kiro release zip in `infra/trial-image` with a version
  assert.
- [x] 2.2 Add a `kiro:` harness block to the `bare` candidate; add the `kiro`
  transport + `kiro-sonnet-4-5` model profile; add `KIRO_API_KEY` to
  `.env.example` + redaction.

## 3. Validation

- [x] 3.1 Driver unit tests: event parsing, command shape, resume, registry
  resolution, cost classification; contract fixture registered.
- [x] 3.2 `bun run src/cli.ts validate` + `bun run test` green.
- [ ] 3.3 Probe: a 1-shot `kiro-cli chat` returns output on the configured model
  (requires the rebuilt trial image and a live Kiro key).
- [ ] 3.4 One smoke trial end-to-end; provenance records harness `kiro` +
  version; telemetry + cost-source recorded.

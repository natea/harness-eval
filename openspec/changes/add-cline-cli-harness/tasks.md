# Tasks: Add the Cline CLI harness

> Requires `add-pluggable-harnesses`.

## 1. Driver
- [ ] 1.1 Add `cline-cli` to `HarnessId`; implement the Cline CLI `HarnessDriver`
  (install + headless task mode + telemetry parse).
- [ ] 1.2 Non-interactive model/auth config to the pinned worker model (BYOK key from
  the registry).

## 2. Image + registry
- [ ] 2.1 Pin the Cline CLI in `infra/trial-image` with a version assert.
- [ ] 2.2 Add a `cline-cli:` harness block to a candidate; add any new key to
  `.env.example` + redaction.

## 3. Validation
- [ ] 3.1 Probe: a 1-shot Cline task resolves the worker model and returns output.
- [ ] 3.2 One smoke trial; provenance records harness + version; telemetry +
  cost-source recorded.
- [ ] 3.3 `bun run test` green; `openspec validate add-cline-cli-harness`.

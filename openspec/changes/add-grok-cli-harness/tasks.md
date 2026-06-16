# Tasks: Add the Grok CLI harness

> Requires `add-pluggable-harnesses`.

## 1. Driver
- [ ] 1.1 Add `grok-cli` to `HarnessId`; implement the Grok CLI `HarnessDriver`
  (install + headless prompt mode + telemetry parse).
- [ ] 1.2 Auth/model config (`GROK_API_KEY` + Grok model id) from the registry.

## 2. Image + registry
- [ ] 2.1 Pin the Grok CLI in `infra/trial-image` with a version assert.
- [ ] 2.2 Add a `grok-cli:` harness block to a candidate; add `GROK_API_KEY` to
  `.env.example` + redaction.

## 3. Validation
- [ ] 3.1 Probe: a 1-shot Grok CLI prompt returns output on the configured model.
- [ ] 3.2 One smoke trial; provenance records harness + version + the harness↔model
  confound caveat; telemetry + cost-source recorded.
- [ ] 3.3 `bun run test` green; `openspec validate add-grok-cli-harness`.

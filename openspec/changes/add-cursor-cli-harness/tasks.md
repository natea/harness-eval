# Tasks: Add the Cursor CLI harness

> Requires `add-pluggable-harnesses`.

## 1. Driver
- [ ] 1.1 Add `cursor-cli` to `HarnessId`; implement the Cursor CLI `HarnessDriver`
  (install + `cursor-agent -p --output-format json` + telemetry parse).
- [ ] 1.2 Model/auth config (`--model` + `CURSOR_API_KEY`/login) from the registry.

## 2. Image + registry
- [ ] 2.1 Pin `cursor-agent` in `infra/trial-image` with a version assert.
- [ ] 2.2 Add a `cursor-cli:` harness block to a candidate; add `CURSOR_API_KEY` to
  `.env.example` + redaction.

## 3. Validation
- [ ] 3.1 Probe: `cursor-agent -p --output-format json` 1-shot returns parseable
  output on the configured model.
- [ ] 3.2 One smoke trial; provenance records harness + version + the Cursor
  routing/account caveat; telemetry + cost-source recorded.
- [ ] 3.3 `bun run test` green; `openspec validate add-cursor-cli-harness`.

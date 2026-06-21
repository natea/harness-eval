# Tasks: Add Goose harness

> Requires `add-pluggable-harnesses` (HarnessDriver contract + dispatch).

## 1. Driver

- [ ] 1.1 Add `goose` to `HarnessId`; implement the Goose `HarnessDriver` (install
  commands + headless `goose run` + telemetry parse) under `src/driver/harnesses/`.
- [ ] 1.2 Non-interactive model/auth config to the pinned worker model
  (`GOOSE_PROVIDER`/`GOOSE_MODEL` + key, or config.yaml); continuation via resume.

## 2. Image + registry

- [ ] 2.1 Pin a Goose CLI install in `infra/trial-image` with a version assert.
- [ ] 2.2 Add a `goose:` harness block to at least one candidate in
  `config/registry.yaml`; add any new provider key to `.env.example` + redaction.

## 3. Validation

- [ ] 3.1 Probe: a 1-shot `goose run` resolves the worker model and returns output.
- [ ] 3.2 One smoke trial end-to-end (build-only) under `goose`; provenance records
  harness `goose` + version; telemetry + cost-source recorded.
- [ ] 3.3 `bun run test` green; `openspec validate add-goose-harness`.

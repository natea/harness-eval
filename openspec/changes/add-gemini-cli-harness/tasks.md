# Tasks: Add the Gemini CLI harness

> Requires `add-pluggable-harnesses`.

## 1. Driver
- [ ] 1.1 Add `gemini-cli` to `HarnessId`; implement the Gemini CLI `HarnessDriver`
  (install + headless `gemini -p` + telemetry parse).
- [ ] 1.2 Auth/model config (`GEMINI_API_KEY` + Gemini model id) from the registry.

## 2. Image + registry
- [ ] 2.1 Pin `@google/gemini-cli` in `infra/trial-image` with a version assert.
- [ ] 2.2 Add a `gemini-cli:` harness block to a candidate; add `GEMINI_API_KEY` to
  `.env.example` + redaction.

## 3. Validation
- [ ] 3.1 Probe: `gemini -p` 1-shot returns output on the configured Gemini model.
- [ ] 3.2 One smoke trial; provenance records harness + version + the harness↔model
  confound caveat; telemetry + cost-source recorded.
- [ ] 3.3 `bun run test` green; `openspec validate add-gemini-cli-harness`.

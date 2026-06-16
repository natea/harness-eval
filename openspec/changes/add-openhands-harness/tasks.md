# Tasks: Add OpenHands harness

> Requires `add-pluggable-harnesses` (HarnessDriver contract + dispatch).

## 1. Driver
- [ ] 1.1 Add `openhands` to `HarnessId`; implement the OpenHands `HarnessDriver`
  (install + `openhands --headless --json` + event-stream telemetry parse).
- [ ] 1.2 LLM config to the pinned worker model (`LLM_MODEL`/`LLM_API_KEY` or
  config.toml); headless always-approve; continuation from the allowlist.

## 2. Image + registry
- [ ] 2.1 Pin `openhands-ai` in `infra/trial-image` with a version assert.
- [ ] 2.2 Add an `openhands:` harness block to a candidate in `config/registry.yaml`;
  add the LLM key to `.env.example` + redaction if new.

## 3. Validation
- [ ] 3.1 Probe: `openhands --headless --json` 1-shot resolves the worker model and
  emits a parseable event stream.
- [ ] 3.2 One smoke trial end-to-end under `openhands`; provenance records harness +
  version; telemetry + cost-source recorded from the event stream.
- [ ] 3.3 `bun run test` green; `openspec validate add-openhands-harness`.

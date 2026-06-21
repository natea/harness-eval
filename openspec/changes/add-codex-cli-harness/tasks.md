# Tasks: Add the Codex CLI harness

> Builds on `harness-drivers` (applied).

## 1. Driver
- [ ] 1.1 Implement the Codex CLI `HarnessDriver` for the `codex` `HarnessId`
  (install + headless `codex exec` + telemetry parse) and register it in the driver
  registry.
- [ ] 1.2 Model/provider config (model-agnostic): map the pinned worker-model
  profile onto a Codex provider — built-in `openai` or a custom
  `[model_providers.<id>]` block (`base_url`, `env_key`, `wire_api = "responses"`),
  with `--oss` supported for local models; non-interactive sandbox/approval flags set.
- [ ] 1.3 Map `codex exec --json` to `SessionRecord`; cost-source per the
  harness-driver rule (harness-reported → profile-priced → tokens-only).

## 2. Image + registry
- [ ] 2.1 Pin `@openai/codex` in `infra/trial-image` with a version assert.
- [ ] 2.2 Add a `codex:` harness block to a candidate; add the configured provider's
  auth env var (e.g. `OPENAI_API_KEY` for the OpenAI provider) to `.env.example` +
  the archiver redaction patterns.

## 3. Contract conformance
- [ ] 3.1 Add a Codex conformance fixture (captured `codex exec --json`) and a case
  in the driver-contract test suite; the Codex driver passes it.

## 4. Validation
- [ ] 4.1 Probe: `codex exec` 1-shot returns output on the configured OpenAI model.
- [ ] 4.2 One smoke trial; provenance records harness `codex` + version + the
  harness↔model confound caveat; telemetry + cost-source recorded.
- [ ] 4.3 `bun run test` green (incl. the driver-contract suite);
  `openspec validate add-codex-cli-harness --strict`.

# Tasks: Add the Deep Agents (dcode) harness

> Builds on `harness-drivers` + the shared worker-env resolver (codex established).

## 1. Driver
- [ ] 1.1 Add `deepagents` to `HarnessId`; implement the `dcode` `HarnessDriver` via
  the print-cli runner (`dcode -n -q` + flags, output to a file) and register it.
- [ ] 1.2 Model/auth (model-agnostic): map the worker profile to `--model
  <provider>:<modelId>` + provider auth env via the shared `resolveWorkerEnv`
  (add a `deepagents` transport); map run budget → `--max-turns`/`--timeout`.
- [ ] 1.3 Telemetry: parse `dcode`'s machine-readable output (or `~/.deepagents/`
  thread transcript) → `SessionRecord`; cost-source per the harness-driver rule.
  Confirm the exact output shape in a spike.

## 2. Image + registry
- [ ] 2.1 Pin `dcode` in `infra/trial-image` (`curl -LsSf https://langch.in/dcode |
  bash`) with a version assert.
- [ ] 2.2 Add a `deepagents:` harness block to a candidate (or a bare baseline); add
  the worker provider's auth env var to `.env.example` + archiver redaction.

## 3. Contract conformance
- [ ] 3.1 Add a `dcode` conformance fixture + a case in the driver-contract suite;
  the deepagents driver passes it.

## 4. Validation
- [ ] 4.1 Probe: `dcode -n` 1-shot returns output on the configured model.
- [ ] 4.2 One smoke trial; provenance records harness `deepagents` + version +
  resolved provider/model; telemetry + cost-source recorded.
- [ ] 4.3 `bun run test` green (incl. the driver-contract suite);
  `openspec validate add-deepagents-harness --strict`.

# Proposal: Add OpenHands as an evaluatable harness

> Depends on **`add-pluggable-harnesses`** (the `HarnessDriver` contract +
> dispatch-by-`HarnessId`). This change contributes one driver.

## Why

[OpenHands](https://www.openhands.dev/product/cli)
([CLI docs](https://docs.openhands.dev/openhands/usage/cli/terminal)) is a popular
open-source coding agent with a first-class **headless** mode that is ideal for this
eval: one-shot tasks, auto-approve, and — uniquely among the candidates — a
**`--json` event stream** (one JSON agent-event per line) that maps cleanly to our
telemetry. It is model-agnostic (LLM via config), so it can drive the run's pinned
worker model and keep a cross-harness comparison fair.

## What Changes

- **Add `openhands` to `HarnessId`** and register an **OpenHands `HarnessDriver`**:
  - **Install**: pinned `openhands-ai` in the trial image (`uvx --from openhands-ai
    openhands` or `pip install openhands-ai==<pin>`), version-asserted.
  - **Headless run**: `openhands --headless -t "<prompt>"` (or `-f <file>`) in the
    workspace, `--json` for the machine-readable event stream. Headless implies
    always-approve (no interactive gates); continuation, if needed, draws only from
    the registry's content-free allowlist.
  - **Model + auth**: configure the LLM to the run's pinned worker model via
    `LLM_MODEL` + `LLM_API_KEY` (or `config.toml`), resolved from the model registry.
  - **Telemetry**: parse the `--json` event stream into `SessionRecord` (turns from
    agent steps, tokens/cost from LLM-usage events); cost via the harness-driver
    cost-source rule.
- **Candidate-registry**: candidates may add an `openhands:` harness block, parallel
  to `claude-code:`; fairness rules unchanged.

## Capabilities

### Modified Capabilities

- `harness-drivers`: adds the OpenHands driver (install + headless `openhands
  --headless --json` + event-stream telemetry mapping).

## Impact

- `HarnessId` gains `openhands`; new OpenHands driver under `src/driver/harnesses/`;
  trial image gains a pinned `openhands-ai` install (Python/uvx).
- `LLM_API_KEY` (or the provider key OpenHands uses for the pinned model) added to
  `.env.example` + archiver redaction if not already present.
- Cross-harness caveat: pin the same worker model across harnesses; OpenHands cost is
  derived from its usage events (`harness-reported`/`profile-priced`).
- Before matrix use: a probe (`openhands --headless --json` 1-shot) + one smoke trial.

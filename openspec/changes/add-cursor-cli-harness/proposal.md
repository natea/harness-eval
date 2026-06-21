# Proposal: Add the Cursor CLI as an evaluatable harness

> Depends on **`add-pluggable-harnesses`** (the `HarnessDriver` contract +
> dispatch-by-`HarnessId`). This change contributes one driver.

## Why

The [Cursor CLI](https://cursor.com/cli) (`cursor-agent`) brings Cursor's coding agent
to the terminal with a print/non-interactive mode and machine-readable output — a good
fit for the headless trial flow. It is **model-selectable** (`--model sonnet`, `gpt-5`,
…), so a run can choose a model that matches the comparison.

## What Changes

- **Add `cursor-cli` to `HarnessId`** and register a **Cursor CLI `HarnessDriver`**:
  - **Install**: pinned `cursor-agent` in the trial image (`curl https://cursor.com/
    install -fsS | bash`), version-asserted.
  - **Headless run**: `cursor-agent -p "<prompt>"` (print mode) with
    `--output-format json`/`stream-json` in the workspace; continuation from the
    registry's content-free allowlist.
  - **Model + auth**: `--model <id>` set to the run's worker model; auth via
    `CURSOR_API_KEY` (or `cursor-agent login`).
  - **Telemetry**: parse the JSON output into `SessionRecord`; cost via the
    harness-driver cost-source rule.
- **Candidate-registry**: candidates may add a `cursor-cli:` harness block.

## Fairness note (Cursor routing/account caveat)

Unlike a pure BYOK harness, Cursor executes through **Cursor's backend and bills the
Cursor account**: the available models are Cursor's set and the model name maps to
Cursor's hosted version, which may differ from the same model accessed directly
(system prompts, tools, routing, rate limits). So even when the model id "matches"
another harness, a Cursor run is not a clean same-model comparison. The eval SHALL
flag the **Cursor routing/account caveat** in provenance + the scorecard, and the
worker-model match SHALL be treated as approximate, not identical.

## Capabilities

### Modified Capabilities

- `harness-drivers`: adds the Cursor CLI driver plus the Cursor routing/account caveat
  for harnesses that execute through a vendor backend.

## Impact

- `HarnessId` gains `cursor-cli`; new driver under `src/driver/harnesses/`; trial image
  gains a pinned `cursor-agent`; `CURSOR_API_KEY` → `.env.example` + redaction.
- Cost/billing is Cursor-account based (not the direct provider) — recorded as such.
- Probe + one smoke trial before matrix use; results carry the routing caveat.

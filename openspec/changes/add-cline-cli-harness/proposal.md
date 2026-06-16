# Proposal: Add the Cline CLI as an evaluatable harness

> Depends on **`add-pluggable-harnesses`** (the `HarnessDriver` contract +
> dispatch-by-`HarnessId`). This change contributes one driver.

## Why

The [Cline CLI](https://cline.bot/cli) brings the open-source Cline coding agent to
the terminal. Cline is **model-agnostic** (bring-your-own-key across providers), so
it can drive the run's pinned worker model — making it a fair, apples-to-apples
addition to the harness comparison alongside Goose and OpenHands.

## What Changes

- **Add `cline-cli` to `HarnessId`** and register a **Cline CLI `HarnessDriver`**:
  - **Install**: pinned Cline CLI (npm) in the trial image, version-asserted.
  - **Headless run**: the Cline CLI's non-interactive task mode against the workspace
    (e.g. `cline task "<prompt>"` / a `-p`/print flag); continuation from the
    registry's content-free allowlist.
  - **Model + auth**: configure Cline to the run's pinned worker model + provider key
    from the model registry (BYOK), so the model is held fixed.
  - **Telemetry**: map the CLI's output (JSON mode if available) to `SessionRecord`;
    cost via the harness-driver cost-source rule.
- **Candidate-registry**: candidates may add a `cline-cli:` harness block.

## Capabilities

### Modified Capabilities

- `harness-drivers`: adds the Cline CLI driver (install + headless task mode +
  telemetry mapping).

## Impact

- `HarnessId` gains `cline-cli`; new driver under `src/driver/harnesses/`; trial image
  gains a pinned Cline CLI; any new provider key → `.env.example` + redaction.
- Model-agnostic → eligible for fair same-model cross-harness comparison.
- Probe + one smoke trial before matrix use.

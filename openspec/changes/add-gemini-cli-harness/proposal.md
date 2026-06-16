# Proposal: Add the Gemini CLI as an evaluatable harness

> Depends on **`add-pluggable-harnesses`** (the `HarnessDriver` contract +
> dispatch-by-`HarnessId`). This change contributes one driver.

## Why

The [Gemini CLI](https://geminicli.com/) is Google's official open-source terminal
coding agent. Adding it lets the eval compare a Google-stack harness against the
others. It runs non-interactively against a single prompt, which fits the headless
trial flow.

## What Changes

- **Add `gemini-cli` to `HarnessId`** and register a **Gemini CLI `HarnessDriver`**:
  - **Install**: pinned `@google/gemini-cli` (npm) in the trial image,
    version-asserted.
  - **Headless run**: `gemini -p "<prompt>"` (non-interactive) in the workspace;
    continuation, if needed, from the registry's content-free allowlist.
  - **Model + auth**: `GEMINI_API_KEY` (or Vertex/OAuth) + the Gemini model id via
    `--model`/`GEMINI_MODEL`, resolved from the model registry.
  - **Telemetry**: map the CLI's output (JSON output mode if available) to
    `SessionRecord`; cost via the harness-driver cost-source rule
    (`profile-priced` from Gemini pricing, else `tokens-only`).
- **Candidate-registry**: candidates may add a `gemini-cli:` harness block.

## Fairness note (harness↔model confound)

Unlike model-agnostic harnesses (Goose, OpenHands), the Gemini CLI **only drives
Gemini models**. So comparing it against Claude Code (Claude models) confounds the
**harness** with the **model** — you are not holding the model fixed. The eval SHALL
flag this: a fair head-to-head with the Gemini CLI is either (a) restricted to
harnesses that can run the same model, or (b) explicitly reported as a
harness+model comparison (provenance + scorecard caveat), never as a pure harness
comparison.

## Capabilities

### Modified Capabilities

- `harness-drivers`: adds the Gemini CLI driver, plus the harness↔model-confound
  caveat for model-locked harnesses.

## Impact

- `HarnessId` gains `gemini-cli`; new driver under `src/driver/harnesses/`; trial
  image gains a pinned `@google/gemini-cli`; `GEMINI_API_KEY` added to `.env.example`
  + redaction.
- Probe + one smoke trial before matrix use; results carry the harness+model caveat.

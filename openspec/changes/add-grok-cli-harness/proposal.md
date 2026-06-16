# Proposal: Add the Grok CLI as an evaluatable harness

> Depends on **`add-pluggable-harnesses`** (the `HarnessDriver` contract +
> dispatch-by-`HarnessId`). This change contributes one driver.

## Why

The [Grok CLI](https://github.com/superagent-ai/grok-cli) (superagent-ai) is an
open-source terminal coding agent for xAI's Grok models. Adding it extends the
harness comparison to the xAI stack. It runs non-interactively against a single
prompt, fitting the headless trial flow.

## What Changes

- **Add `grok-cli` to `HarnessId`** and register a **Grok CLI `HarnessDriver`**:
  - **Install**: pinned Grok CLI (npm, `superagent-ai/grok-cli`) in the trial image,
    version-asserted.
  - **Headless run**: the Grok CLI's non-interactive prompt mode (e.g. `grok -p
    "<prompt>"`) in the workspace; continuation from the registry's content-free
    allowlist.
  - **Model + auth**: `GROK_API_KEY` (xAI) + the Grok model id, resolved from the
    model registry.
  - **Telemetry**: map the CLI's output to `SessionRecord`; cost via the
    harness-driver cost-source rule (`profile-priced` from Grok pricing, else
    `tokens-only`).
- **Candidate-registry**: candidates may add a `grok-cli:` harness block.

## Fairness note (harness↔model confound)

Like the Gemini CLI, the Grok CLI **only drives Grok (xAI) models**, so comparing it
against Claude Code confounds the **harness** with the **model**. The eval SHALL flag
this: a fair head-to-head is either restricted to harnesses that can run the same
model, or explicitly reported as a harness+model comparison (provenance + scorecard
caveat), never as a pure harness comparison.


**Judge neutrality:** the blind judge SHALL be neutral to the harnesses being compared — for a Gemini-vs-Grok run, a judge from neither vendor (e.g. Claude `claude-sonnet`) avoids self-preference bias; the judge SHALL NOT be Grok when Grok is under comparison. (Per the `harness-drivers` judge-neutrality requirement; a non-neutral judge is flagged as a self-preference caveat.)
## Capabilities

### Modified Capabilities

- `harness-drivers`: adds the Grok CLI driver (reusing the model-locked-harness
  confound caveat).

## Impact

- `HarnessId` gains `grok-cli`; new driver under `src/driver/harnesses/`; trial image
  gains a pinned Grok CLI; `GROK_API_KEY` added to `.env.example` + redaction.
- Probe + one smoke trial before matrix use; results carry the harness+model caveat.

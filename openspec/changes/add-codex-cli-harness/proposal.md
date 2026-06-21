# Proposal: Add the Codex CLI as an evaluatable harness

> Builds on **`harness-drivers`** (the `HarnessDriver` contract +
> dispatch-by-`HarnessId`, now applied). This change contributes one driver.
> `codex` was one of the original stub `HarnessId`s; this gives it a real driver.

## Why

The [Codex CLI](https://github.com/openai/codex) is OpenAI's official open-source
terminal coding agent. It was named as a target harness id from the start but has
no driver yet. Adding it lets the eval compare an OpenAI-stack harness against the
others. Its `codex exec` subcommand runs non-interactively against a single prompt,
which fits the headless trial flow.

## What Changes

- **Register a Codex CLI `HarnessDriver`** for the `codex` `HarnessId`:
  - **Install**: pinned `@openai/codex` (npm) in the trial image, version-asserted.
  - **Headless run**: `codex exec "<prompt>"` (non-interactive automation mode) in
    the workspace; continuation, if needed, only from the registry's content-free
    allowlist.
  - **Model + auth**: `OPENAI_API_KEY` (or ChatGPT/Codex sign-in) + the OpenAI model
    id (e.g. `gpt-5-codex`) via `--model`/config, resolved from the model registry.
  - **Telemetry**: map `codex exec --json` (JSONL event stream) to `SessionRecord`;
    cost via the harness-driver cost-source rule (`harness-reported` if Codex emits
    dollars, else `profile-priced` from OpenAI pricing, else `tokens-only`). Output
    redirected to a file in the sandbox and read after exit.
  - **Contract conformance**: ship a Codex conformance fixture so the driver passes
    the shared driver-contract test suite (dispatch, output-by-file capture,
    telemetry normalization, cost-source, unknown-id rejection).
- **Candidate-registry**: candidates may add a `codex:` harness block.

## Fairness note (harness↔model confound)

Like the Gemini and Grok CLIs, the Codex CLI **only drives OpenAI models**, so
comparing it against Claude Code (Claude models) confounds the **harness** with the
**model**. The eval SHALL flag this: a fair head-to-head is either restricted to
harnesses that can run the same model, or explicitly reported as a harness+model
comparison (provenance + scorecard caveat), never as a pure harness comparison.

**Judge neutrality:** the blind judge SHALL be neutral to the harnesses being
compared — for a Codex-vs-Claude-Code run, a judge from neither vendor (e.g. a
non-OpenAI, non-Anthropic model) avoids self-preference bias; the judge SHALL NOT be
an OpenAI model when Codex is under comparison. (Per the `harness-drivers`
judge-neutrality requirement; a non-neutral judge is flagged as a caveat.)

## Capabilities

### Modified Capabilities

- `harness-drivers`: adds the Codex CLI driver (with contract-suite conformance) and
  the harness↔model-confound caveat for this model-locked harness.

## Impact

- New driver under `src/driver/harnesses/` registered for `codex`; trial image gains
  a pinned `@openai/codex`; `OPENAI_API_KEY` added to `.env.example` + redaction.
- A Codex conformance fixture added to the driver-contract test suite.
- Probe + one smoke trial before matrix use; results carry the harness+model caveat.

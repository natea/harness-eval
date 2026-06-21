# Proposal: Add the Deep Agents (dcode) CLI as an evaluatable harness

> Builds on **`harness-drivers`** (the `HarnessDriver` contract +
> dispatch-by-`HarnessId`, applied). Contributes one driver.

## Why

[Deep Agents Code (`dcode`)](https://docs.langchain.com/oss/python/deepagents/code/overview)
is LangChain's open-source coding agent, built on the Deep Agents SDK. It runs
headlessly (`dcode -n "<prompt>"`), reads/writes files, runs shell commands, and is
**model-agnostic** (works with any LLM — OpenAI, Anthropic, Google, Fireworks, …),
selecting a model via `--model <provider>:<model>`. Adding it lets the eval compare a
LangChain-stack harness against Claude Code and Codex, and — because it's
model-agnostic — it can hold the worker model fixed for a *pure* harness comparison.

## What Changes

- **Add `deepagents` to `HarnessId`** and register a **`dcode` `HarnessDriver`**:
  - **Install**: pinned `dcode` in the trial image (`curl -LsSf https://langch.in/dcode
    | bash`), version-asserted.
  - **Headless run**: `dcode -n "<prompt>"` in the workspace with `-q` (clean output),
    `--max-turns`/`--timeout` mapped to the run's wall-clock/turn budget, and a shell
    allow-list flag set for autonomous execution. Continuation, if needed, from the
    registry's content-free allowlist.
  - **Model + auth (model-agnostic)**: map the run's pinned worker-model profile to
    `--model <provider>:<modelId>`; auth via the provider's env var (or
    `~/.deepagents/.env`), resolved from the model registry via the shared
    worker-env resolver.
  - **Telemetry**: parse `dcode`'s machine-readable output / per-thread transcript
    into `SessionRecord` (duration, tokens, turns); cost via the harness-driver rule
    (`harness-reported` if it emits dollars, else `profile-priced`, else
    `tokens-only`). Output redirected to a file and read after exit.
  - **Contract conformance**: ship a `dcode` conformance fixture so the driver passes
    the shared driver-contract suite.
- **Candidate-registry**: candidates may add a `deepagents:` harness block.

## Fairness note (model-agnostic harness)

Like Codex (and unlike Gemini/Grok), `dcode` is model-agnostic, so it can hold the
worker model fixed and take part in a pure harness comparison when the same model is
reachable across harnesses. A run where harnesses end up on different models is the
ordinary cross-model case (provenance + scorecard caveat), not a model lock.
**Judge neutrality** applies per `harness-drivers`: the blind judge SHALL be neutral
to the compared harnesses.

## Capabilities

### Modified Capabilities

- `harness-drivers`: adds the Deep Agents (`dcode`) driver, model-agnostic via
  `--model provider:model`, with contract-suite conformance.

## Impact

- `HarnessId` gains `deepagents`; new driver under `src/driver/`; trial image pins
  `dcode`; the worker provider's auth env var added to `.env.example` + archiver
  redaction; a model transport mapping a profile to `--model provider:model`.
- A `dcode` conformance fixture added to the driver-contract suite.
- Probe + one smoke trial before matrix use; provenance records harness `deepagents`
  + version + the resolved provider/model.
- **Open question (impl):** `dcode`'s machine-readable output shape for telemetry
  (JSON vs. per-thread transcript in `~/.deepagents/`) — confirm at implementation.

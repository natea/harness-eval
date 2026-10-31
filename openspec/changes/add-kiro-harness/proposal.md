# Proposal: Add the Kiro CLI as an evaluatable harness

> Depends on **`add-pluggable-harnesses`** (the `HarnessDriver` contract +
> dispatch-by-`HarnessId`). This change contributes one driver.

## Why

[Kiro CLI](https://kiro.dev/docs/cli/) is AWS's terminal coding agent and the
successor to the Amazon Q Developer CLI. Adding it lets the eval compare an
AWS-vendor harness against Claude Code, Codex, OpenCode, Qwen Code, and
zerocode. It runs a prompt non-interactively with machine-readable output, which
fits the headless trial flow.

## What Changes

- **Add `kiro` to `HarnessId`** and register a **Kiro CLI `HarnessDriver`**:
  - **Install**: pinned Kiro release zip in the trial image, version-asserted.
  - **Headless run**: `kiro-cli chat --no-interactive --trust-all-tools
    --output-format stream-json` against the workspace; continuation via
    `--resume-id <sessionId>`.
  - **Model + auth**: `KIRO_API_KEY` (subscription plans) + `--model` from the
    model registry (`kiro-sonnet-4-5`).
  - **Telemetry**: map `runStarted`/`sessionUpdate`/`metadata`/`runFinished`
    events to `SessionRecord`; Kiro meters credits, not per-token USD, so cost
    is `profile-priced` or `tokens-only`.
- **Candidate-registry**: candidates may add a `kiro:` harness block; `bare`
  declares one.

## Fairness note (harness↔model confound)

Kiro routes its own vendor model roster. A comparison against a harness on a
different model confounds harness and model; record it as a harness+model
comparison, not a pure harness comparison.

## Capabilities

### Modified Capabilities

- `harness-drivers`: adds the Kiro CLI driver (install + headless
  `kiro-cli chat` + telemetry mapping) to the pluggable harness set.

## Impact

- `HarnessId` gains `kiro`; new driver under `src/driver/`; trial image gains a
  pinned Kiro CLI.
- New model transport `kiro` plus a `kiro-sonnet-4-5` profile; new
  `KIRO_API_KEY` added to `.env.example` and archiver redaction.
- Image-only harness: the `worktree` provider is rejected; preflight probes the
  pinned CLI.
- Before matrix use: a cheap probe (`kiro-cli chat` 1-shot) + one smoke trial.

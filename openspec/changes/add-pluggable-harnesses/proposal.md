# Proposal: Pluggable harness drivers

## Why

The eval compares **harnesses** — the agentic framework driving the build — with
every other variable fixed. But only `claude-code` is actually drivable today:
`HarnessId` lists `claude-code | opencode | codex`, yet `src/driver/session.ts`
imports `runClaudeSession` and calls it directly, so the other ids are stubs with
no driver. Adding any non-Claude harness (Goose, OpenHands, Gemini CLI, Grok CLI,
…) first requires a way to **dispatch by harness**. This change introduces that
foundation so each harness becomes a small, isolated addition.

## What Changes

- **Define a `HarnessDriver` contract** — a per-harness module that, inside the
  trial sandbox, knows how to:
  1. **install** the harness at a pinned version,
  2. **run a headless session** against the rendered base prompt in the workspace
     (with bounded continuation at approval gates from the registry allowlist), and
  3. **parse** the harness's output into the common `SessionRecord`
     (duration, tokens, cost, turns) so telemetry is harness-agnostic.
- **Dispatch by `config.harness`**: `session.ts` resolves the driver from a
  registry (`{ "claude-code": claudeDriver, … }`) instead of importing one harness.
  `claude-code` is refactored into the first `HarnessDriver` (no behavior change).
- **Model + auth plumbing per harness**: each driver configures the harness to use
  the run's **pinned worker model** (via the model registry's key/endpoint
  resolution), so a cross-harness run holds the model fixed and the harness is the
  only variable.
- **Telemetry normalization**: the cost-source rule generalizes — `harness-reported`
  when the harness emits dollars, else `profile-priced` (model-registry pricing) or
  `tokens-only`. Output is redirected to a file in the sandbox and read after exit
  (the agent-built-daemon-inherits-stdout footgun applies to every harness).
- **Fairness rules extended**: identical rendered base prompt to every candidate
  (unchanged); within a run every candidate uses the identical worker-model profile
  (unchanged); a **cross-harness** run pins the same worker model across harnesses
  and is keyed by (candidate, **harness**, workerModel) so comparisons group right.

## Capabilities

### New Capabilities

- `harness-drivers`: the `HarnessDriver` contract, dispatch-by-`HarnessId`,
  per-harness model/auth + telemetry normalization, and the cross-harness fairness
  rule. Individual harnesses (Goose, OpenHands, Gemini CLI, Grok CLI, …) are added
  by separate changes that each contribute one driver.

## Impact

- `src/driver/session.ts` dispatches via a driver registry; `claude.ts` is wrapped
  as the `claude-code` driver (behavior unchanged, all existing tests stay green).
- New `HarnessDriver` interface + a `src/driver/harnesses/` registry; provenance
  already records harness + version, so no schema break.
- `candidate-registry` already supports per-harness setup (`harnesses:` map keyed by
  `HarnessId`); no schema change, just more keys become drivable.
- Trial image gains pinned installs only when a specific harness change lands.
- Risk: per-harness behavioral differences (continuation semantics, telemetry
  shape) — each harness change probes + smokes before matrix use, same discipline as
  new providers/models.

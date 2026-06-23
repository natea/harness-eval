# Pluggable Backends and Harness Onboarding

This branch has two pluggability surfaces:

- **Isolation providers** decide where each trial runs. They implement
  `SandboxProvider` in `src/providers/types.ts`.
- **Harnesses** decide how a candidate framework is installed and driven. The
  registry is scoped by harness; `claude-code`, `codex`, and `zerocode`
  (ZeroClaw, over ACP — see `docs/ZEROCODE-HARNESS.md`) have implemented drivers.

Keep those surfaces separate. A new provider should not require registry
changes, and a new harness should not require provider-specific code.

## Add an Isolation Provider

1. Implement `SandboxProvider`:
   - `id` must be added to `IsolationProviderId` in `src/types.ts` and
     `ProviderId` in `src/providers/types.ts`.
   - `snapshotId` should record the exact image, template, or snapshot used for
     provenance. Use `null` only when the provider has no base image concept.
   - `provision(trialId)` must create a fresh workspace and return a `Sandbox`
     whose `exec`, `writeFile`, `copyOut`, and `destroy` methods do not leak
     state across trials.
   - `preflight(ctx)` should fail before any trial starts when credentials,
     daemon health, image availability, lifetime caps, or resource limits cannot
     satisfy the run.
2. Wire the provider in `createProvider` (`src/providers/factory.ts`).
3. Document provider setup under `docs/` or `infra/`, including image/template
   build steps and known CLI/API quirks.
4. Add tests:
   - factory construction and unknown-provider failure;
   - preflight success/failure with actionable remediation;
   - live isolation tests when the backend is available;
   - one scheduler dry run with a fake executor proving the provider works
     through the full orchestration chain.

## Add a Harness

1. Add the harness ID to `HarnessId` in `src/types.ts`.
   The registry uses `z.partialRecord(HarnessId, HarnessSetup)`, so unknown
   harness keys fail load validation instead of being silently ignored.
2. Add a harness section for each candidate in `config/registry.yaml`.
   A candidate can be omitted temporarily, but `resolveCandidates` will fail
   a run that selects that candidate for a harness it does not support.
3. Implement the driver adapter.
   Today `runMatrix` calls `executeSessionScript`, which is Claude Code
   specific. A second harness should introduce an explicit dispatch point from
   `config.harness` to the matching driver while preserving this contract:
   - install commands run before the driver starts;
   - the rendered session script receives the shared `basePrompt` bytes;
   - generic continuation policy is honored without task-specific hints;
   - worker model/env is injected into the driver, never into registry YAML;
   - transcripts, telemetry, status, cap reason, and notes are returned in the
     same `SessionScriptResult` shape or an intentionally versioned successor.
4. Keep provenance stable.
   `TrialProvenance` must record candidate version, harness ID, harness version,
   worker model, provider, snapshot, PRD hash, test-plan hash, and rendered
   session script for every terminal state.
5. Add tests:
   - registry rejects unimplemented harness keys;
   - `resolveCandidates` names the candidate and missing harness;
   - rendered scripts substitute `{{BASE_PROMPT}}` consistently;
   - driver dispatch passes model/env/continuation policy and preserves resume
     semantics where the harness supports sessions;
   - scheduler integration proves install, driver execution, archive, teardown,
     and provenance all happen through a fake provider with no external spend.

## Validation Checklist

Run these before a real matrix:

```sh
bun run src/cli.ts validate --target symphony-daemon
bun test tests/unit.test.ts
bun test tests/e2e-dry.test.ts tests/e2e-dry-target.test.ts
```

For providers with live backends available, also run:

```sh
bun test tests/providers-pluggable.test.ts
```

For real runs, preflight is part of `bun run src/cli.ts run ...`; it should
fail before provisioning if the selected provider is not ready.

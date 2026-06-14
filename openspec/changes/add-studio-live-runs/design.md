# Design: Live Run Execution from the Studio

## Context

`launchRun(req, { dryRun })` in `src/studio/launcher.ts` validates the request
(mirroring `RunConfig`) and then, for `dryRun: true`, runs the matrix on the
`WorktreeProvider` with a `fakeExecutor` (zero spend) in a background promise,
tracking a `QueueEntry` in an in-memory `Map`. For `dryRun: false` it returns an
error telling the operator to copy the CLI command. We extend this same shape to
real execution rather than introducing a new subsystem.

The CLI's real path (`cmdRun` in `src/cli.ts`) is the reference: load target +
optional design, render the base prompt, `createProvider(config.provider, …)`,
`runMatrix(...)` with the real session executor, optional `--grade`, then
`buildResults` + `writeResults`/`writeScorecard`. The studio job runs that same
sequence.

## Goals / Non-Goals

- **Goals:** real billed runs from the UI; bounded by explicit caps +
  confirmation; cancellable; an authorization seam that billing can plug into;
  preserve the localhost-only + scoped-writes invariants.
- **Non-Goals:** identity/accounts, credit ledger, payments (→ `add-eval-credits`);
  a durable cross-restart job queue (→ optional later); multi-tenant isolation.

## Decisions

### 1. Local background job, not a separate worker service

The studio server spawns the real run in-process as a tracked background job
(extending today's `void (async () => …)()` pattern), the same way the dry run
already executes. Rationale: simplest path to "trigger from the UI," adequate for
single-operator + early users, and the *build itself* is still isolated by the
chosen sandbox provider (daytona/e2b/docker). A durable external worker queue is
a later robustness upgrade, not needed to ship.

Implication: jobs are in-memory; a studio restart loses *tracking* of an
in-flight run (the run's artifacts on disk are unaffected and still load in the
Runs view from `runs/`). Acceptable for this stage; called out so it isn't a
silent gap.

### 2. `QueueEntry` gains a real-run lifecycle + cancel

Extend `QueueEntry` with `kind: "dry" | "live"`, a `costUsdSoFar` (from
telemetry as trials complete), and an `abort` handle. A real job:

```
enqueue → running (per-trial: pending|running|completed|capped|infra-failed)
        → completed | error | cancelled
```

Cancel sets an abort flag the scheduler checks between trials and calls the
provider's teardown for any in-flight sandbox, so a cancelled run never leaks a
cloud sandbox (consistent with the test-cleanup discipline already in the repo).

### 3. Explicit budget confirmation before any spend

`launchRun(req, { dryRun: false })` requires `req.confirmed === true` AND a
resolved budget (trial/run USD caps + wall-clock). The Configure view shows a
confirm dialog summarizing: provider, candidates × trials, per-trial + per-run
USD caps, wall-clock cap, worker/judge models, and whether grading runs. Without
`confirmed`, the call returns a `needsConfirmation` payload (the resolved budget
+ matrix) rather than launching — the UI renders that as the dialog.

### 4. Authorization seam: `canLaunch(principal, request)`

A single function guards every real launch:

```ts
type LaunchDecision = { ok: true } | { ok: false; reason: string };
interface LaunchPolicy {
  canLaunch(principal: Principal, req: StudioRunRequest): Promise<LaunchDecision>;
  onLaunched?(principal: Principal, runId: string, req: StudioRunRequest): Promise<void>;
  onSettled?(principal: Principal, runId: string, outcome: RunOutcome): Promise<void>;
}
```

- **Default policy (this change):** allow when bound to localhost for a single
  operator, or require a configured operator token (env) if set. No identity
  model beyond "the operator."
- **Credits policy (later change):** `canLaunch` checks the principal's credit
  balance and estimated cost; `onLaunched` debits; `onSettled` refunds on
  infra-failure. The launch path calls these hooks and is otherwise unchanged —
  that's the whole point of defining the seam now.

`principal` is a minimal opaque type (`{ id: string }`) so the later change can
back it with real accounts without reshaping the launcher.

### 5. Dry run stays as an explicit preview

Dry run is not removed — it becomes the zero-spend "preview the wiring" option
alongside real launch. Both go through the same validation + job lifecycle; only
the provider/executor and the `canLaunch`/budget gating differ.

## Spend-safety argument

Real spend requires *all* of: a non-dry request, `canLaunch` → ok, an explicit
`confirmed` budget acknowledgement, and resolved caps the scheduler enforces
(`trialCostUsd`/`runCostUsd`/wall-clock, already in `RunConfig.budget`). The
server still binds localhost by default and still writes only through the
orchestrator's entry points. No path reaches a real session without crossing all
four gates.

## Risks / Trade-offs

- **In-memory jobs lost on restart** — mitigated: artifacts persist + reload from
  `runs/`; durable queue is a later upgrade. Logged, not hidden.
- **Cancel races** — teardown is best-effort between trials; a sandbox mid-build
  is torn down via the provider, but a provider that ignores teardown could leak.
  The provider cleanup contract (used by the live-test sweep) covers the
  supported providers.
- **Authorization stub could be mistaken for real auth** — the default policy is
  explicitly "single operator / optional token," documented as NOT a substitute
  for the credits/identity change.

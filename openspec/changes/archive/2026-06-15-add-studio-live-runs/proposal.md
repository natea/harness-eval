# Proposal: Live Run Execution from the Studio

## Why

The Eval Studio can configure a run and show results, but it cannot actually
start a real evaluation. `src/studio/launcher.ts` hard-blocks live launches: the
only path that executes is a **dry run** (worktree + a fake executor, zero
spend); a real run returns "copy the CLI command and run it from your shell."
That gate was a deliberate spend-safety decision while the studio was read-mostly.

We now want operators (and, later, paying users) to trigger **real, billed**
evaluations from the UI. Real builds cost money — subscription/API spend per
trial — so the studio can't simply remove the gate; it needs to *replace* the
blanket block with **explicit, bounded, authorized** execution:

- a real run executes as a **local background job** (same path as `cli.ts run`),
- behind **explicit budget caps + a confirmation step** surfaced in the UI,
- gated by a single **authorization seam** (`canLaunch`) that is a trivial
  "allow" (or operator-token) policy today and the plug-in point for the credit
  ledger / paywall later (a separate `add-eval-credits` change).

Designing the authorization seam now is what makes billing a non-invasive
follow-on instead of a launch-path rewrite.

## What Changes

- **Replace dry-run-only with budgeted live execution.** The studio launch path
  can start a real run through the orchestrator using the configured provider
  and budgets, writing to `runs/` exactly as the CLI does. Dry run remains as an
  explicit, zero-spend preview option.
- **Local background job lifecycle.** Real runs execute as a tracked background
  job on the studio host: enqueue → running (per-trial status) → completed /
  error, with a **cancel** that tears down in-flight sandboxes. Status is read
  from run directories + orchestrator state without mutating artifacts.
- **Explicit budget confirmation.** Launching a real run requires
  acknowledging the trial/run USD caps, wall-clock cap, provider, and candidate×
  trial matrix — no real spend without a confirm.
- **Authorization seam (`canLaunch`).** Every real launch passes through
  `canLaunch(principal, request) → { ok } | { denied, reason }`. The default
  policy allows (single-operator) or checks an operator token; the credits change
  later supplies a balance-checking policy + debit/refund without touching the
  launch path.

Out of scope (explicitly deferred to `add-eval-credits`): user accounts,
identity, credit ledger, payments. This change only designs the seam they hook.

## Impact

- Affected specs: `eval-studio` (run configuration → real execution; new live-job
  + authorization requirements).
- Affected code: `src/studio/launcher.ts` (real run path + job lifecycle +
  cancel), `src/studio/index.ts` (launch/confirm/cancel endpoints), the studio
  Configure/Runs views (confirm dialog, live status, cancel), `src/studio/
  options.ts` (request validation already mirrors RunConfig).
- Spend safety is preserved by construction: real runs require explicit
  confirmation + caps + authorization; the localhost bind and "scoped writes
  through the orchestrator only" invariants are unchanged.

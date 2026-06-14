# Tasks: Live Run Execution from the Studio

## 1. Authorization seam

- [x] 1.1 Define `LaunchPolicy` (`canLaunch` + `onLaunched`/`onSettled` hooks),
  `Principal` (`{ id }`), and `LaunchDecision` types in the studio module
- [x] 1.2 Implement the default policy: allow for a localhost single operator;
  if an operator token is configured (env), require it. No identity model beyond
  the operator. Document it is NOT a substitute for the credits change.
- [x] 1.3 Resolve the active policy in one place so `add-eval-credits` can swap in
  a balance-checking policy without touching the launch path

## 2. Real-run job lifecycle

- [x] 2.1 Extend `QueueEntry` with `kind: "dry" | "live"`, `costUsdSoFar`, and an
  `abort` handle; keep dry-run behavior intact
- [x] 2.2 Add the live launch path to `launchRun`: load target (+ optional
  design), real `createProvider(config.provider)`, `runMatrix` with the real
  session executor, optional grading, `buildResults` + write reports — the same
  sequence as `cmdRun`, run as a tracked background job
- [x] 2.3 Implement cancel: an abort flag the scheduler honors between trials +
  provider teardown for any in-flight sandbox, so a cancelled run leaks nothing
- [x] 2.4 Update `costUsdSoFar` and per-trial status from telemetry as trials
  settle; surface capped/infra-failed states with provenance notes

## 3. Budget confirmation + gating

- [x] 3.1 Require `confirmed === true` + a resolved budget for a real launch;
  without it, return a `needsConfirmation` payload (resolved budget + candidate×
  trial matrix) instead of launching
- [x] 3.2 Enforce that real spend requires all of: non-dry request, `canLaunch`
  ok, `confirmed`, and resolved caps; otherwise no real session is reached

## 4. Studio endpoints + views

- [x] 4.1 Endpoints: launch (dry|live), confirm, and cancel — localhost-bound,
  writing only through the orchestrator's entry points (scoped-writes invariant)
- [x] 4.2 Configure view: a confirm dialog summarizing provider, matrix, USD +
  wall-clock caps, models, and grading before a real launch
- [x] 4.3 Runs view: live status for real jobs (per-trial states, cost-so-far,
  capped/infra-failed badges) + a cancel control

## 5. Validation

- [x] 5.1 Unit: `canLaunch` decisions (allow / token-required / denied);
  `needsConfirmation` returned without `confirmed`; real launch refused when the
  policy denies
- [x] 5.2 Integration (no spend): a live launch with a fake provider/executor
  injected runs the full job lifecycle (enqueue → per-trial status → completed),
  writes results + scorecard, and cancel tears down without leaking
- [x] 5.3 Spend-safety test: assert no real session/provider is constructed
  unless all four gates pass
- [x] 5.4 Docs: README/studio note on triggering real runs, the operator-token
  option, and the `canLaunch` seam as the billing plug-in point

# Tasks: Pluggable harness drivers

## 1. Driver contract + dispatch

- [x] 1.1 Define `HarnessDriver` (install + headless runSession + telemetry parse)
  and `HarnessRunOptions`; a `HARNESS_DRIVERS` registry keyed by `HarnessId`.
- [x] 1.2 Refactor `src/driver/claude.ts` into the `claude-code` driver; preserve
  `runClaudeSession` behavior and the `runSession` test seam.
- [x] 1.3 `src/driver/session.ts` dispatches by `config.harness` via the registry;
  fail fast on a harness id with no registered driver.

## 2. Telemetry + fairness

- [x] 2.1 Generalize cost-source classification across drivers (harness-reported /
  profile-priced / tokens-only); keep file-redirect output capture.
- [x] 2.2 Results keyed by (candidate, harness, workerModel); scorecard shows harness
  + model; cross-harness runs assert one pinned worker model.

## 3. Validation

- [x] 3.1 Unit: dispatch selects the right driver; unknown harness fails fast;
  claude-code path unchanged (existing suite green).
- [x] 3.2 `bun run test` green; `openspec validate add-pluggable-harnesses`.

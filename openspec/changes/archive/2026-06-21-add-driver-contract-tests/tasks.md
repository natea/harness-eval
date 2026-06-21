# Tasks: Driver contract-test suite

## 1. Suite scaffolding
- [x] 1.1 Add `tests/fixtures/driver-output/claude-code.jsonl` — a recorded
  `claude-code` stream-json result line (no secrets).
- [x] 1.2 Add `tests/driver-contract.test.ts` with a `DriverContractCase` registry
  and a shared `FakeSandbox` (prompt/exec recording, file-backed output).

## 2. Contract assertions (table-driven, one row per driver)
- [x] 2.1 Dispatch: `getHarnessDriver(id).id === id` and `id` is in `runnableHarnessIds()`.
- [x] 2.2 Output-by-file: prompt written to a namespaced file; transcript read in a
  separate exec issued after the run exec returns.
- [x] 2.3 Telemetry: fixture parses into the common `SessionRecord` shape.
- [x] 2.4 Cost-source: classification (via `classifyCostSource`) matches the case's
  expected `costSource`.
- [x] 2.5 Fairness: identical input prompt → identical prompt-file content; base
  prompt not mutated by the driver.
- [x] 2.6 Fail-fast: an unregistered harness id throws before any sandbox call.

## 3. Seed + validate
- [x] 3.1 Register the `claude-code` case; suite green (7 pass).
- [x] 3.2 `bun run test` green except a pre-existing studio-e2e timing flake
  (confirmed failing identically on `main`); `openspec validate
  add-driver-contract-tests --strict` passes.
- [x] 3.3 Note in `design.md` how cost-source classification is composed
  (driver parse → `classifyCostSource`) so new non-reporting drivers need no new
  classification code.

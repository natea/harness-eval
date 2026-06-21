# Proposal: A driver contract-test suite every harness driver must pass

> Relates to **`add-pluggable-harnesses`** (the `HarnessDriver` contract +
> dispatch-by-`HarnessId`). This change adds the *executable conformance gate* for
> that contract, so the per-harness driver changes (`add-gemini-cli-harness`,
> `add-grok-cli-harness`, `add-goose-harness`, `add-cursor-cli-harness`,
> `add-cline-cli-harness`, `add-openhands-harness`) have a shared bar to clear.

## Why

`harness-drivers` already states what a driver must do — dispatch by harness id,
capture output to a file and read it after the process exits, normalize telemetry,
classify the cost source, keep the rendered base prompt identical across harnesses,
and fail fast on an unknown harness. Today only `claude-code` is implemented and
the only test (`tests/driver-layer.test.ts`) exercises that one driver ad hoc.

As the six proposed CLI drivers land, each will re-derive its own tests, and the
spec invariants (output-by-file, fairness, fail-fast, cost-source classification)
will be enforced unevenly. We want **one table-driven contract suite** that takes a
driver plus a recorded output fixture and asserts the spec's invariants, so adding
a harness means adding a row, not re-proving the contract.

This is **Layer 1** of the driver test strategy: no real spend, no network, no
sandbox — a `FakeSandbox` plus committed CLI-output fixtures. It does not replace
the real-spend probe + smoke trial each per-harness change already requires; it
front-loads everything provable offline.

## What Changes

- **Add a reusable driver contract-test suite** (`tests/driver-contract.test.ts`)
  parameterized over a registry of driver conformance cases. Each case supplies the
  driver, a recorded CLI-output fixture, and the expected normalized
  `SessionRecord` + `costSource`. The suite asserts, per driver:
  - **Dispatch**: `getHarnessDriver(id)` returns a driver whose `id` matches.
  - **Output-by-file**: the run writes the prompt to a namespaced file and reads
    the transcript back in a *separate* exec after the run exec returns (a started
    service cannot hold the capture open).
  - **Telemetry normalization**: the fixture parses into the common `SessionRecord`
    shape (duration, turns, tokens, cost).
  - **Cost-source classification**: `harness-reported` when the fixture emits
    dollars, `profile-priced` / `tokens-only` otherwise.
  - **Fairness**: identical `prompt` in → identical prompt-file content out, with no
    per-driver mutation of the rendered base prompt.
  - **Fail-fast**: an unregistered harness id throws before any sandbox call.
- **Add committed fixtures** under `tests/fixtures/driver-output/` — one recorded
  output sample per driver (starting with `claude-code`), so `parseOutput` is
  testable forever without spending.
- **Keep `claude-code` as the seed case**, proving the suite green against the one
  implemented driver. New drivers register a case in the same table.

## Capabilities

### Modified Capabilities

- `harness-drivers`: adds a **driver contract-conformance** requirement — every
  registered driver SHALL pass the shared contract suite against a recorded fixture.

## Impact

- New: `tests/driver-contract.test.ts`, `tests/fixtures/driver-output/*`.
- No production-code behavior change is required for `claude-code`. Cost-source
  classification already exists (`classifyCostSource`, `src/models.ts`); the suite
  composes driver output through it rather than re-implementing it.
- No real spend: `FakeSandbox` + fixtures only. `bun run test` stays green.

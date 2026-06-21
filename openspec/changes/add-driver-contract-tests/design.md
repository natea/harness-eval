# Design: Driver contract-test suite

## Shape

A table of `DriverContractCase`s, one per registered driver:

```ts
interface DriverContractCase {
  harnessId: HarnessId;          // must resolve via getHarnessDriver
  fixture: string;               // recorded CLI output (read from tests/fixtures/driver-output/)
  expected: {
    costSource: CostSource;
    isError: boolean;
    // plus spot-checked SessionRecord fields the fixture pins
  };
}
```

A single `describe.each(CASES)` block runs every assertion against every case, so a
new driver is one row + one fixture, not a new test file.

## Why a fake sandbox

The driver contract is defined purely in terms of `Sandbox` calls
(`writeFile`, `exec`, `cat <outFile>`). A `FakeSandbox` that records writes/execs
and replays the fixture for the `cat` exec lets us assert the *exact* call sequence
the spec mandates (write prompt → run → separate read) without provisioning
anything. This mirrors the existing `tests/driver-layer.test.ts` fake but
generalizes it across drivers.

## Fixtures, not live capture

One recorded output sample per driver is committed under
`tests/fixtures/driver-output/`. This makes `parseOutput` regression-locked and
keeps the suite zero-spend. Fixtures must be scrubbed of secrets (session ids and
token counts are fine; auth tokens are not).

## Cost-source classification is composed, not driver-local

A driver returns a `SessionRecord` (tokens + the harness's own dollar figure, if
any); it does not classify the cost source itself. The classification rule the spec
names lives in `classifyCostSource(profile, harnessReportedUsd, inTok, outTok)`
(`src/models.ts`) and is keyed on the worker profile: native Anthropic + harness
dollars → `harness-reported`; priced third-party → `profile-priced`; otherwise
`tokens-only`. So the contract case pairs a driver fixture with a worker
`ModelProfile` and asserts that feeding the parsed record through
`classifyCostSource` yields the expected source + dollars. This exercises the real
production path (driver parse → classifier) rather than asserting a field the driver
does not own.

When a non-reporting CLI driver lands (emits tokens, no dollars), its case simply
supplies a non-Anthropic profile and expects `profile-priced` / `tokens-only`; no
new classification code is needed — the logic already exists and is unit-tested in
`tests/models.test.ts`.

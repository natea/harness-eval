# Tasks: Live build stream

## 1. Provider read primitive (read-only tap)
- [x] 1.1 Read-only incremental read implemented provider-agnostically as
  `sandboxLineReader` (`src/live/tap.ts`) via the existing `Sandbox.exec` with a
  short-lived `tail -n +N` (not `tail -f`) — no `Sandbox` interface change, works on
  every provider, and cannot hold the build's stdout open.
- [x] 1.2 Read-only by construction (only `tail`/read; never writes) — asserted by a
  test with a fake sandbox (no writeFile, command matches `^tail -n +`, never `-f`).

## 2. Live tap + incremental parse
- [x] 2.1 `LiveTurnStream.poll()` reads new COMPLETE lines of the driver's output
  file, buffering a partial trailing line until its newline. The driver's post-exit
  read is unchanged (registration wraps it in try/finally; telemetry/archive
  byte-identical).
- [x] 2.2 Feeds accumulated complete lines through the shared `transcript-render`
  `parseTranscript` (multi-harness, monotonic) and emits the new-turns slice; each
  turn redacted via the archiver's `redactSecrets` before emit.

## 3. Studio transport + view
- [x] 3.1 SSE endpoint `/api/runs/:id/trials/:trialId/stream`
  (`src/studio/live-stream.ts`): opens a tap for a building trial via the live
  registry, emits redacted turns append-only, closes + tears down on terminal state
  (handoff `done`, idle/max-duration caps, client-disconnect cancel); localhost-bound.
- [x] 3.2 Studio Live panel (`LiveStream` in `TrialView`): renders streamed turns
  with the shared `TurnBlock`, hands off to the archived Conversation replay on
  `done`, graceful fallback (renders nothing live → archived replay) when no stream.

## 4. Reuse claude-replay
- [x] 4.1 Evaluated. Decision: reuse OUR `transcript-render` parser (already
  multi-harness incl. Codex) for the single-parser invariant; claude-replay's
  approach (line-by-line turn grouping, redaction, live-watch) validated the design.
- [x] 4.2 Not vendored — adopting its player would duplicate our parser/redaction and
  add a dependency; the player remains an optional future enhancement (no dep added,
  so no pin needed). Recorded in design.md.

## 5. Validation
- [x] 5.1 Unit: incremental parse buffers partial lines; redaction applies to a
  seeded secret; codex format streams through the same path (`tests/live-stream.test.ts`).
- [x] 5.2 Integration (no spend): a fixture session fed one byte-chunk at a time
  streams end-to-end and the accumulated turns equal its post-hoc `parseTranscript`.
- [x] 5.3 Safety: tap is read-only (test); the post-exit read/telemetry/archive stay
  byte-identical (existing driver-layer/driver-contract suites still green); stream
  closes on done/idle/cancel with no leaked timer/handle.
- [x] 5.4 Live smoke validated: a studio-launched codex-oauth `notes` build streamed
  live turns in the Live panel (the agent's reads/commands/file-writes appearing in
  real time), confirmed by the operator, then handed off to the archived Conversation
  on completion. Surfaced + fixed two real bugs in the process: the studio's
  worker-env resolver drift (codex profiles) and an EventSource `onerror`-on-close
  false "stream unavailable".
- [x] 5.5 `bun run test` green (only the pre-existing e2e timeouts);
  `openspec validate add-live-build-stream --strict` passes.

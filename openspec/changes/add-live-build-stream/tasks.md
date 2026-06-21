# Tasks: Live build stream

## 1. Provider read primitive (read-only tap)
- [ ] 1.1 Add a read-only incremental read to the `Sandbox` interface
  (`readRange(path, offset)` or equivalent) — worktree tails a host file;
  daytona/e2b poll a remote byte-offset read. No write path.
- [ ] 1.2 Implement it per provider; assert read-only (never writes the sandbox).

## 2. Live tap + incremental parse
- [ ] 2.1 A per-trial tap that reads new bytes of the driver's `/tmp/he-out-<slot>.jsonl`
  during exec, buffering a partial trailing line until newline-complete. The
  post-exit read + parse stay byte-identical (no change to telemetry/archive).
- [ ] 2.2 Feed newly-completed lines through the shared `transcript-render`
  `parseTranscript` (multi-harness) and emit appended `Turn[]`; redact each turn via
  the archiver's `redactSecrets` before emit.

## 3. Studio transport + view
- [ ] 3.1 SSE endpoint `/api/runs/:id/trials/:trialId/stream` that opens a tap for a
  building trial, emits redacted turns append-only, and closes + tears down the tap
  on terminal state (no leaked handle); localhost-bound.
- [ ] 3.2 Studio Live panel: render streamed turns (reuse Conversation rendering +
  the live-run stage indicator); hand off to the archived `/transcript` replay on
  completion, deduped by (session, turn index); graceful fallback when no stream.

## 4. Reuse claude-replay
- [ ] 4.1 Evaluate adopting claude-replay (its multi-harness parsers / player /
  redaction) — prototype its player vs. extending the Conversation view against a
  real Codex stream; choose the option that preserves the single-parser invariant.
- [ ] 4.2 If vendored, pin the dependency + record provenance/license per the repo's
  attribution norms.

## 5. Validation
- [ ] 5.1 Unit: incremental parse buffers partial lines; live turns equal the
  post-hoc replay for the same fixture; redaction applies to a seeded secret.
- [ ] 5.2 Integration (no spend): a fixture session file written incrementally is
  streamed end-to-end and the rendered turns match its post-hoc render.
- [ ] 5.3 Safety: the archived transcript + telemetry are byte-identical with and
  without the tap (read-only / no build impact); stream closes with no leak.
- [ ] 5.4 Live smoke against a real building trial (worktree) confirms turns appear
  as the agent works and the view hands off to the archived replay at the end.
- [ ] 5.5 `bun run test` green; `openspec validate add-live-build-stream --strict`.

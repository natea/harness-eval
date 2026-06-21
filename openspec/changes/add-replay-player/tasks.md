# Tasks: Adopt claude-replay's player

> Follow-up viewer upgrade. Plumbing (tap/SSE/parser) unchanged.

## 1. Spike + parser decision
- [ ] 1.1 Vendor/pin claude-replay's player; record provenance + license.
- [ ] 1.2 Fixture-equality spike: does claude-replay's parser yield the same turns as
  our `transcript-render` for real Claude + Codex transcripts? Decide adapter (our
  parser → player view model) vs. adopting its parser.

## 2. Archived replay in the player
- [ ] 2.1 Render a completed trial's Conversation in the player: playback (play/pause,
  step, speed), chapter/timeline scrubber, collapsible tool-call groups.
- [ ] 2.2 Self-contained export (Download HTML) of a trial's replay.

## 3. Live build in the player
- [ ] 3.1 Feed the SSE turn stream into the same player so a building trial plays
  incrementally; hand off to the archived replay on `done` (visually continuous).

## 4. Safety + validation
- [ ] 4.1 Redaction preserved: a seeded secret is absent from the live view AND any
  exported HTML.
- [ ] 4.2 Graceful degrade to the readable turn list when player assets are missing.
- [ ] 4.3 `bun run test` green; `openspec validate add-replay-player --strict`.

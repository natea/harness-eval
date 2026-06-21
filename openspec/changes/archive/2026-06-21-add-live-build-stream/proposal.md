## Why

Today you can only watch a trial's build *after it finishes*: the harness driver
redirects the session output to a file in the sandbox and reads it once, after the
process exits (`src/driver/print-cli.ts`), so the studio's Conversation tab is a
post-hoc replay. While a multi-minute build runs you see only a coarse stage badge
(building/grading), not what the agent is actually doing. A live stream of the
sandbox session — the agent's reasoning, commands, file changes, and output as they
happen — makes runs observable in real time (debug a stuck build, spot a wrong
turn early, demo the harness). [claude-replay](https://github.com/es617/claude-replay)
already parses every harness format we run (Claude Code, Codex, Cursor, Gemini,
OpenCode), has a `--serve --watch` live mode, a self-contained player, and secret
redaction — so we can build on it instead of from scratch.

## What Changes

- **Read-only live tap on the session output.** While the driver's `codex exec` /
  `claude -p` process runs writing its JSONL to the sandbox file, a tail reads new
  bytes incrementally without touching the build (no extra writes, never holds the
  process's stdout). The existing post-exit read + parse is unchanged (telemetry and
  the archived transcript stay byte-identical).
- **Stream to the studio over SSE.** A new endpoint streams append-only parsed
  turns for an in-progress trial, reusing the shared `transcript-render` parser (now
  multi-harness) so the live view and the post-hoc replay render identically. Secrets
  are redacted in the stream with the same rules as the archiver.
- **Live view in the studio.** The trial/Run view gains a Live panel that, for a
  building trial, shows turns as they arrive (reusing the Conversation rendering and
  the live-run stage indicator); when the build completes it seamlessly becomes the
  archived replay.
- **Reuse claude-replay where it fits.** Adopt its multi-harness parsers and/or
  player rather than reinventing — either as a vendored dependency for the player or
  as a reference for incremental parsing — keeping our single-parser invariant.
- **Bounded + safe.** The tap is per-trial, lifecycle-bound to the live run, removed
  on trial completion/cancel; localhost-only; no impact on build determinism or the
  fairness invariants.

## Capabilities

### New Capabilities
- `live-build-stream`: the read-only session tap, the incremental multi-harness
  parse, the studio SSE transport with redaction, and the live→archived handoff.

### Modified Capabilities
- `eval-studio`: a Live build panel that streams an in-progress trial's session and
  becomes the archived replay on completion.

## Impact

- **Code**: `src/driver/` (an optional streaming tap alongside the post-exit read;
  the post-exit path unchanged), `src/providers/` (a read-only file-tail/stream
  primitive per provider — worktree tails a host file; daytona/e2b poll a remote
  read), `src/studio/index.ts` (SSE endpoint) + the studio Live view, reuse of
  `transcript-render` (multi-harness) + the archiver redaction, optional
  `claude-replay` dependency.
- **Invariants**: read-only (no build mutation), file-redirect/daemon-stdout rule
  preserved, secrets redacted in the stream, identical archived transcript.
- **Non-goals (follow-up)**: streaming for non-file-redirect harnesses; persisting
  the live stream separately from the archived transcript; cloud-sandbox push
  (vs poll) transport.

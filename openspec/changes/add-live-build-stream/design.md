## Context

The harness driver runs a headless CLI (`claude -p`, `codex exec`) whose
machine-readable output is **redirected to a sandbox file** and read once after the
process exits (`src/driver/print-cli.ts` → `cat ${outFile}`). This file-redirect is
deliberate: agents spawn daemons that inherit stdout and would hold the exec stream
open forever. The studio already has post-hoc replay (`transcript-render`, now
multi-harness incl. Codex) and live-run *status* (stage badges), but no live *stream*
of the build. [claude-replay](https://github.com/es617/claude-replay) already solves
the parse+render+live-watch problem for exactly our harness set and ships secret
redaction and a self-contained player.

## Goals / Non-Goals

**Goals:**
- Watch an in-progress trial's session live in the studio, read-only, no build impact.
- One parser for live + post-hoc (no divergence); secrets redacted in the stream.
- Reuse claude-replay rather than reinventing parsing/playback.

**Non-Goals:**
- Changing the post-exit capture, telemetry, or archived transcript (must stay
  byte-identical).
- Cloud-provider *push* transport (start with polling reads); non-file-redirect
  harnesses; a separate persisted live-stream artifact.

## Decisions

**1. Tail the existing output file; never a second stdout consumer.**
The tap reads the same `/tmp/he-out-<slot>.jsonl` the driver writes, via a provider
read primitive (`readRange`/incremental `cat`/`tail -c +N`). Rationale: reusing the
one file keeps live and archived identical and respects the daemon-stdout rule — we
never attach to the build process. Worktree = tail a host file; daytona/e2b = poll a
remote byte-offset read. A partial trailing line is buffered until newline-complete.
- *Alternative:* `tee` the process output to a second stream. Rejected — a second
  stdout consumer reintroduces the daemon-holds-stdout footgun.

**2. SSE over WebSocket for transport.**
Append-only, one-directional, auto-reconnect, trivial behind `Bun.serve` — matches
the data shape (a growing turn list). Localhost-bound like every other studio
endpoint. Each connection drives one trial's tap; closing the stream removes the tap.
- *Alternative:* WebSocket. Rejected — bidirectionality is unneeded.

**3. Reuse `transcript-render` for parsing; reuse claude-replay for the player.**
Our `parseTranscript` already yields harness-agnostic `Turn[]` (Claude + Codex). The
live path feeds it incrementally (parse only newly-completed lines, append turns).
For the *viewer*, evaluate adopting claude-replay's player (vendored dependency) vs.
extending the existing Conversation component; pick whichever keeps the single-parser
invariant and least surface area. Redaction reuses the archiver's `redactSecrets`
before emitting each turn.

**4. Lifecycle bound to the live run.**
The tap is created when a trial enters `building` and torn down on terminal state
(completed/failed/cancelled/capped), mirroring the preview-manager lifecycle
discipline (no leaked handles). On completion the studio view swaps the SSE source
for the archived `/transcript` endpoint; turn identity (session + index) dedupes the
handoff so nothing is lost or doubled.

## Risks / Trade-offs

- **Polling latency on cloud providers** → start with a short poll interval + byte
  offset; push transport is a follow-up. Worktree (local) is effectively immediate.
- **Secret leakage in a live (un-archived) view** → redact in the stream path with
  the same rules as the archiver; add a test that a seeded secret is redacted live.
- **Divergence between live and archived** → forbid a second parser; the live path
  MUST call the shared `transcript-render`. Handoff dedupes by (session, turn index).
- **Tap perturbing the build** → read-only, separate from the build exec; an
  integration test asserts identical archived transcript with and without the tap.

## Open Questions

- Vendoring claude-replay's player vs. extending the existing Conversation view —
  decide during implementation by prototyping both against a real Codex stream.
- Provider read primitive shape (a generic `readRange(path, offset)` on `Sandbox`)
  and whether daytona/e2b expose an efficient incremental read.

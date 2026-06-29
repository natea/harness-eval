# Explore: Transcript Replay (claude-replay) for Trials

## Why

Every trial already archives the worker's per-session JSONL transcripts at
`runs/<id>/trials/<trialId>/transcripts/session-*.jsonl`, and the studio has a
bespoke **Conversation** viewer (from `add-trial-transcript-audit`) that replays
the build with error navigation and an outline trace.

[**claude-replay**](https://github.com/es617/claude-replay) is a community tool
that turns those same JSONL transcripts into **self-contained, dependency-free
HTML replays** with playback controls (0.5–5×), collapsible thinking/tool calls,
a file-activity sidebar, and themes — and it reads not just Claude Code but
**Codex, Cursor, Gemini CLI, and OpenCode** formats. It also has a live mode
(`--serve --watch`) that follows a session *as it's being written*.

Two things make it worth exploring:

1. **Shareable, embeddable replays.** A single self-contained HTML per trial is
   ideal for the demo site and for sharing a build outside the local studio —
   something the in-studio React viewer can't produce.
2. **Real-time build replay.** Watching a trial's agent work *live* — and the
   open question the requester raised: can we do that for **multiple builds
   running concurrently in different sandboxes**?

The multi-agent format support also aligns with the pluggable-harness direction
(Codex/OpenCode candidates), where transcript shapes differ per harness.

## What to explore

1. **Post-hoc HTML export** — generate a `replay.html` per trial from the
   *archived, redacted* JSONL; surface it from the studio Trial drill-down and
   (optionally) embed/link it from the demo site. Low-risk: operates on the
   already-scrubbed archive.
2. **Real-time replay across sandboxes** — the hard part. Trial transcripts are
   written *inside* remote sandboxes (daytona/e2b/docker); the orchestrator only
   gets them at archive time. Live replay needs the in-sandbox JSONL **streamed
   out continuously**, mirrored locally per trial, then watched — and N concurrent
   sandboxes multiplexed into N live replays (or one "build wall").
3. **Redaction safety (the blocker to resolve).** The archiver redacts secrets
   (`redactSecrets` in `src/driver/archive.ts`) only *at archive time*. A live
   transcript still contains the injected worker auth token and any secrets the
   agent printed — so naive live replay **leaks credentials**. Any real-time mode
   must scrub on the fly, before the transcript leaves the trial boundary.
4. **Build vs. buy vs. both** — vendor/pin claude-replay (or `npx` it) for
   shareable exports, while keeping the existing bespoke viewer for in-studio
   interactive use; decide where each wins and whether they converge.

## Out of scope (until the exploration recommends it)

Building the live-egress pipeline, vendoring a fork, or replacing the existing
Conversation viewer. This change produces a feasibility assessment + a go/no-go
recommendation with a scoped follow-on, not an implementation.

## Impact

- New (exploratory) spec: `transcript-replay` — the capability shape + the
  non-negotiable redaction invariant any replay must honor.
- Touches (later, if adopted): the grade/archive step (export), the studio Trial
  drill-down (surface), and per-provider transcript egress for a live mode.
- Relates to `add-trial-transcript-audit` (the in-studio Conversation viewer) —
  this explores a complementary *export/real-time* path, not a replacement.

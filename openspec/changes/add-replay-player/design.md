## Context

Two studio surfaces render build conversations as a flat `TurnBlock` list: the
archived Conversation tab (`trial-transcript-audit`) and the Live build panel
(`live-build-stream`). Both are driven by the shared `transcript-render` `Turn[]`
(multi-harness: Claude Code + Codex). claude-replay renders the same sessions as a
self-contained, zero-dependency player (playback, chapter timeline, collapsible tool
calls, redaction, HTML export) and already parses our harness formats.

## Goals / Non-Goals

**Goals:** an interactive player for both archived + live views; collapsible tool
calls + chapters + playback; self-contained export; redaction preserved; one source
of turns.

**Non-Goals:** changing the tap/SSE plumbing or archived transcript format; grading
changes; a server-side render service. This is a viewer upgrade only.

## Decisions

**1. Keep our parser as the source of truth; adapt to the player's view model.**
`transcript-render` already yields harness-agnostic turns and enforces the
single-parser/fairness invariant. Prefer feeding the player from our `Turn[]` via a
thin adapter. Only swap to claude-replay's parser if a spike proves it yields
identical turns for our fixtures — otherwise we'd risk live/archived divergence.

**2. Vendor the player, don't depend on a service.**
claude-replay is zero-runtime-dep and emits a self-contained HTML player. Embed/
vendor the player asset, pin its version, and record provenance + license (the
adapted-source rules). No network calls from the studio.

**3. Same player for live and archived (handoff stays seamless).**
The Live panel feeds the SSE turn stream into the player incrementally; on `done` it
loads the archived turns into the same player — the live→archived handoff the
live-build-stream spec already requires, now visually continuous.

**4. Redaction is non-negotiable in both stream and export.**
Turns are already redacted upstream (`redactSecrets`); the export path SHALL NOT
re-introduce raw content. Verify an exported HTML contains no seeded secret.

## Risks / Trade-offs

- **Parser divergence if we adopt claude-replay's** → gate on a fixture-equality
  spike; default to our parser + adapter.
- **Vendored asset drift / license** → pin version, record provenance + license,
  refresh deliberately.
- **Export leaks secrets** → test a seeded secret is absent from exported HTML.
- **Player perf on very long sessions** → chapter/virtualization; cap inline payload
  like the current renderer does.

## Open Questions

- Adapter to the player's model vs. adopting its parser — decide by the
  fixture-equality spike against real Claude + Codex transcripts.
- Embedding the player inside the React studio (component) vs. linking out to an
  exported HTML per trial.

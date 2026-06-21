# Proposal: Adopt claude-replay's player for the conversation/live UI

> Follow-up to `add-live-build-stream` (live stream shipped) and
> `add-trial-transcript-audit` (archived replay). Both currently render a plain
> scrolling list of `TurnBlock`s; this upgrades the *viewer*, not the data.

## Why

Our build-conversation UI (the Conversation tab and the Live build panel) is a flat
list of turn blocks. [claude-replay](https://github.com/es617/claude-replay) renders
the same agent sessions as a far more usable **player**: play/pause + step + variable
speed (0.5–5×), a **timeline scrubber with chapters**, **collapsible tool-call
groups** ("6 tool calls"), turn grouping, secret redaction, and **Download HTML /
export** of a self-contained replay. It already parses every harness format we run
(Claude Code, Codex, …) — exactly the formats our shared `transcript-render` handles.
Adopting its player closes the visual gap and gives shareable exports essentially for
free, fulfilling the "reuse, don't rebuild" intent flagged as a follow-up in the
live-build-stream design.

## What Changes

- **Evaluate and adopt claude-replay's player** for both surfaces:
  - **Archived replay** (Conversation tab) — render a trial's session(s) in the
    player (playback, chapters, collapsible tool calls) and offer Download/Export.
  - **Live build** — feed the SSE turn stream into the player so a building trial
    plays incrementally, then seamlessly becomes the archived replay on `done`.
- **Single source of turns.** Keep our `transcript-render` parser as the source of
  truth (the single-parser/fairness invariant) and drive the player from our `Turn[]`
  — OR, if adopting claude-replay's parser is cleaner, prove it produces identical
  turns first. Decide during the spike.
- **Integration mode.** Prefer vendoring/embedding the player (self-contained, zero
  runtime deps) over a network dependency; pin the version and record provenance +
  license per the adapted-source rules.
- **Redaction preserved.** Secrets stay redacted in both the live stream and any
  exported HTML, exactly as today.

## Capabilities

### Modified Capabilities

- `eval-studio`: the trial conversation/live views render via an interactive player
  (playback, chapter timeline, collapsible tool calls) and support exporting a
  self-contained replay, replacing the flat turn list.

## Impact

- **Code:** the studio Conversation + Live components adopt the player; a thin
  adapter maps our `Turn[]` to the player's model (or swaps in its parser if proven
  equivalent); export wiring; vendored player asset pinned with provenance.
- **Invariants:** single-parser/fairness preserved; redaction preserved in live +
  export; read-only.
- **Non-goals:** changing the tap/SSE plumbing or the archived transcript format;
  altering grading; a server-side rendering service. Deferred until prioritized.

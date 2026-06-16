# Proposal: Auditable / Replayable Trial Transcripts

## Why

Every trial already archives the full agent session as raw Claude Code
stream-json at `runs/<run-id>/trials/<trial-id>/transcripts/session-NNN.jsonl`
(one JSON object per line: `system`, `assistant`, `user`/tool-result,
`result`). That file is the complete request↔response back-and-forth of the
build, but it is effectively unauditable by a human: it interleaves system
bootstrap noise, base64 tool payloads, and token-usage metadata, and gives no
visual distinction between *what the agent asked for* (a tool call / prompt)
and *what came back* (tool result / model text).

When a build behaves surprisingly — a candidate scores low, an app fails
cold-start, a worker burns budget looping — the operator's only recourse today
is to hand-read the `.jsonl` or `jq` it line by line. There is no readable
replay. This blocks the core debugging loop the harness exists to support:
understanding *how* a framework arrived at its artifact, not just the score.

## What Changes

- Add a pure **transcript renderer** that parses the archived stream-json into
  an ordered list of conversation turns — user prompt, assistant text,
  tool-use (request), tool-result (response), and the terminal result — each
  tagged with role/direction so request and response are unambiguous.
- Emit a **human-readable Markdown rendering** per trial
  (`transcripts/conversation.md`, plus per-session `session-NNN.md`) at archive
  time, so an audit artifact exists on disk without launching the studio. Large
  tool payloads (file bodies, base64) are truncated with a size marker; the raw
  `.jsonl` remains the unabridged ground truth.
- Add a **studio Trial-view "Conversation" tab** that renders the same turns
  with request/response visually distinguished (role lanes, collapsible tool
  payloads, step boundaries, per-turn token/cost when present), so a run can be
  replayed in the browser.
- Add a backfill script (`scripts/render-transcripts.ts <run-dir> [trial-id]`)
  that produces the Markdown rendering for already-archived runs, since the
  rendering derives entirely from the existing `.jsonl`.
- The renderer reads the **already-redacted** archived `.jsonl` (secret
  redaction happens at archive time today), so no new secret-egress path is
  introduced. Framework markers are intentionally *not* scrubbed here — this is
  the operator audit surface, distinct from the workspace-blind copy the judge
  sees; the judge-neutrality invariant is unaffected.

## Capabilities

### New Capabilities

- `trial-transcript-audit`: deterministic rendering of an archived trial's
  stream-json session(s) into a role-tagged, request/response-distinguished
  readable transcript (Markdown on disk + structured turns for the studio).

### Modified Capabilities

- `eval-studio`: the Trial view gains a Conversation tab that replays the
  rendered turns with request and response clearly delineated.

## Related Changes

- **`add-artifact-preview`** is the *output* half of trial inspection (audit the
  built deliverable + boot it as a live demo); this change is the *process* half
  (replay the build conversation). They share no data source — artifact-preview
  reads `trials/<id>/workspace/` and the app's cold-start logs; this reads
  `trials/<id>/transcripts/*.jsonl` — and no risky surface (preview executes
  agent code under sandbox isolation; this is a pure read of already-redacted
  text). They DO both extend the studio Trial drill-down (`TrialView.tsx`):
  artifact-preview adds **Artifacts** + **Demo**, this adds **Conversation**.
  Whichever lands second MUST rebase its `eval-studio` trial-view delta so the
  drill-down ends with one coherent set of sibling tabs (Artifacts / Demo /
  Conversation), not two diverging "trial view" requirement sets.

## Impact

- `src/grading/` or `src/report/` gains `transcript-render.ts` (pure parser →
  turns + Markdown); no new dependencies.
- `src/driver/archive.ts` writes `conversation.md` / `session-NNN.md` alongside
  the existing `.jsonl` during archival.
- `src/studio/` gains a `/api/runs/:id/trials/:trialId/transcript` route and a
  Conversation tab in `TrialView.tsx`.
- `scripts/render-transcripts.ts` for backfilling existing runs.
- No change to grading inputs, judge neutrality, the workspace-blind copy, the
  base prompt, or PRD/test-plan freezes. `runs/` remains gitignored ground
  truth; the Markdown is an archive-time artifact, never committed.

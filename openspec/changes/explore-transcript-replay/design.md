# Design: Transcript Replay (claude-replay)

## Context

- **Input we already have:** `trials/<id>/transcripts/session-*.jsonl` — the
  worker's Claude Code session log, **redacted at archive time**.
- **What exists:** an in-studio React **Conversation** viewer (replay with error
  navigation + outline) from `add-trial-transcript-audit`.
- **claude-replay:** Node 18+, zero runtime deps, esbuild build; reads Claude
  Code / Codex / Cursor / Gemini / OpenCode JSONL; emits one self-contained HTML;
  `claude-replay <session> -o replay.html`, web editor `claude-replay`, live
  `claude-replay --serve --watch`; can chain up to 20 sessions into one replay.

## Two paths, very different risk

### Path A — post-hoc shareable export (low risk)

At grade/archive time (or on demand from the studio), run claude-replay over a
trial's **archived, already-redacted** session JSONL → `trials/<id>/replay.html`.
Surface it as a "Download / open replay" link in the Trial drill-down, and embed
or link it from the demo site. Because it consumes the scrubbed archive, it
inherits the existing redaction guarantee — no new leak surface.

Open sub-questions: vendor/pin vs `npx` (reproducibility vs image weight);
node-in-trial-image cost; how its multi-session chaining maps to our
`session-000..N.jsonl` per trial; fidelity vs the bespoke viewer.

### Path B — real-time replay across sandboxes (the hard part)

claude-replay's `--serve --watch` follows **local** files. Our builds run in
**remote** sandboxes and the transcript is written to a file *inside* the
sandbox. So a live mode needs, per trial:

```
in-sandbox session.jsonl ──(stream)──▶ on-the-fly redaction ──▶ local mirror/<trial>.jsonl ──▶ watch ──▶ live HTML
```

- **Egress** differs by provider: `worktree` (local — the file is already on the
  host, trivial), `docker` (exec `tail -f` / a mounted volume), `daytona`/`e2b`
  (a streaming exec or short-interval poll of the in-sandbox file — feasible
  given headless output is redirected to a file in the sandbox, but
  network-fragile over long multi-minute streams).
- **Multi-sandbox:** N trials → N mirror files → N watchers/tabs, or a single
  "build wall" showing concurrent trials side by side. claude-replay's chaining
  is *merge*, not concurrent playback, so concurrent display is our composition,
  not its feature.

### The blocker: redaction must move earlier

This is the crux and the reason Path B is *explore*, not *build*. `redactSecrets`
runs at **archive time**; a live transcript still contains the injected worker
auth token (`CLAUDE_CODE_OAUTH_TOKEN`/API key) and anything the agent echoed.
Streaming raw → leaking credentials into a viewable replay. A live mode is only
acceptable if redaction runs **streaming, before the transcript leaves the trial
boundary** — and the streaming scrubber must be at least as strict as the
archive one. Until that's proven, no live bytes should be served.

## Recommendation framing (to be decided by the exploration)

A likely-good split: **adopt claude-replay for Path A** (shareable, self-contained
exports — its real strength, and safe on the redacted archive), **keep the
bespoke viewer** for in-studio interactive review (error nav already built), and
treat **Path B (real-time) as a gated follow-on** contingent on a proven
streaming-redaction story. The exploration confirms or revises this.

## Risks / trade-offs

- **Credential leak via live transcripts** — the dominant risk; gates all of Path B.
- **Third-party tool drift** — pin a version (freeze discipline) or `npx`; assess
  the license before vendoring.
- **Duplication with the existing viewer** — decide export-only vs augment vs
  converge, so we don't maintain two replay UIs.
- **Cloud-stream fragility** — long live streams over laptop networks are the same
  failure mode noted elsewhere; mirror+resume, don't assume a stable socket.

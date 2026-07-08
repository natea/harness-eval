# Tasks: Explore Transcript Replay (claude-replay)

## 1. Evaluate the tool

- [ ] 1.1 Run claude-replay over a real archived trial's `session-*.jsonl`
  (`runs/<id>/trials/<id>/transcripts/`) → a `replay.html`; assess fidelity vs the
  in-studio Conversation viewer (thinking, tool calls, timestamps, file activity)
- [ ] 1.2 License + packaging assessment: license terms; vendor/pin a version vs
  `npx`; cost of node-in-the-trial-image; how its multi-session chaining maps to
  our per-trial `session-000..N.jsonl`

## 2. Path A — post-hoc export (low-risk)

- [ ] 2.1 Design where export runs (grade/archive step or on-demand studio action)
  and where it's surfaced (Trial drill-down link; optional demo-site embed)
- [ ] 2.2 Confirm it consumes only the **redacted** archive (inherits existing
  redaction); spec the artifact path (`trials/<id>/replay.html`)

## 3. Path B — real-time replay feasibility

- [ ] 3.1 Per-provider transcript egress spike: can we stream the in-sandbox
  session JSONL live? Start with `worktree` (local) and `docker`, then assess
  `daytona`/`e2b` (streaming exec vs poll; network fragility)
- [ ] 3.2 Multi-sandbox multiplexing: N concurrent trials → N live replays or one
  "build wall"; feasibility + UX sketch (claude-replay chains/merges, doesn't play
  concurrently — composition is on us)
- [ ] 3.3 Watch wiring: mirror per-trial files locally and drive claude-replay
  `--serve --watch` (or its watch mechanism) over the mirror dir

## 4. Redaction safety (blocks any live mode)

- [ ] 4.1 Determine whether `redactSecrets` (src/driver/archive.ts) can run
  **streaming**, line-by-line, at least as strictly as the archive pass
- [ ] 4.2 Enumerate the live leak surface (injected worker auth token, agent-echoed
  secrets) and define the gate: no un-redacted bytes ever served
- [ ] 4.3 Go/no-go on live mode contingent on a proven streaming-redaction story

## 5. Decision

- [ ] 5.1 Overlap decision vs `add-trial-transcript-audit`: export-only / augment /
  converge — avoid maintaining two replay UIs
- [ ] 5.2 Recommendation + scoped follow-on change(s): which paths to build, in
  what order, with the redaction gate explicit for any real-time work

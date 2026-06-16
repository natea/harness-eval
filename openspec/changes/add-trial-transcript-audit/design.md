# Design: Auditable / Replayable Trial Transcripts

## Source of truth

Each session step archives Claude Code `stream-json` to
`trials/<trial-id>/transcripts/session-NNN.jsonl`. Observed event shape (from a
real 195-line trial): `system` (bootstrap/init + periodic, ~56%),
`assistant`/`assistant` (model turns with text + `tool_use` blocks, ~27%),
`user`/`user` (tool results fed back, ~16%), `rate_limit_event`, and a single
terminal `result`. The renderer is a **pure function of this file** — it adds no
new capture path and stays correct for every already-archived run.

## Turn model

Parse each `.jsonl` line into zero-or-more `Turn`s:

```
type Turn =
  | { kind: "prompt";      role: "user";      text }                       // the rendered task / continuation prompt
  | { kind: "assistant";   role: "assistant"; text }                       // model prose
  | { kind: "tool_use";    role: "assistant"; tool; input; id }            // REQUEST: agent calls a tool
  | { kind: "tool_result"; role: "tool";      forId; output; isError }     // RESPONSE: tool returns
  | { kind: "result";      role: "system";    status; durationMs; costUsd; usage }
```

- `system` lines are dropped except `init` (surfaced once as a compact header:
  model, cwd, tools available) — they are bootstrap noise, not conversation.
- An `assistant` message expands to one `assistant` turn for its text plus one
  `tool_use` turn per tool-call block, preserving order.
- A `user` message carrying `tool_result` blocks expands to one `tool_result`
  turn per block, matched to its `tool_use` by id.
- Direction is explicit: `tool_use` = request (agent → environment),
  `tool_result` = response (environment → agent). This is the
  "what is the request and what is the response" the operator asked for.

Sessions are rendered in order and concatenated; session boundaries (each
continuation prompt from the registry allowlist) are headed
`## Session N — <step label>` so multi-step builds read as one conversation.

## Rendering

`renderMarkdown(turns)` → Markdown with one block per turn:

- Prompt / assistant text: blockquoted role label + body.
- `tool_use`: ` REQUEST · <tool> ` heading + fenced JSON input.
- `tool_result`: ` RESPONSE · <tool> ` heading + fenced output, `✗ error`
  badge when `isError`.
- Payload caps: any field > `MAX_INLINE` (e.g. 4 KB) is truncated with
  `… [+N KB elided — see session-NNN.jsonl]`. The `.jsonl` stays unabridged, so
  truncation never loses ground truth.

The studio consumes the **structured turns** (same parser, served as JSON), not
the Markdown, so the browser can lane request/response, collapse large
payloads, and show per-`result` cost/usage inline.

## Why on disk *and* in the studio

- On-disk Markdown: zero-dependency audit that survives without the server,
  greppable, diffable across trials, attachable to a bug report.
- Studio tab: interactive replay for the common in-browser debugging loop.

Both derive from one parser, so they cannot drift.

## Redaction & neutrality

- The renderer reads the **post-redaction** `.jsonl` (archive.ts redacts known
  secret patterns before writing). No raw secret ever reaches the renderer, so
  no new egress surface — the renderer is downstream of the existing redactor.
- Framework markers are **not** scrubbed: this is the operator audit view, not
  judge input. The blind code-quality judge continues to read only the scrubbed
  `workspace-blind` copy. Judge neutrality and the worker≠judge rule are
  untouched.

## Backfill

`scripts/render-transcripts.ts <run-dir> [trial-id]` walks archived trials and
writes `conversation.md` + `session-NNN.md` from existing `.jsonl`. Idempotent
(overwrites the derived Markdown only); never touches `.jsonl`, grades, or
results.

## Alternatives considered

- **Capture a second readable stream during the build.** Rejected: doubles the
  capture path, risks divergence from ground truth, and can't help the runs
  already archived. Rendering from the canonical `.jsonl` is lossless and
  retroactive.
- **Studio-only viewer, no on-disk artifact.** Rejected: the operator asked to
  "audit the logs", which implies a portable artifact that doesn't require the
  server running; on-disk Markdown also makes cross-trial diffing trivial.

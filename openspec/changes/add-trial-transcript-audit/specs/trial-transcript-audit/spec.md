# Delta: trial-transcript-audit — readable trial conversation rendering

## ADDED Requirements

### Requirement: Deterministic transcript rendering
The system SHALL render an archived trial's `stream-json` session transcripts
into an ordered sequence of role-tagged conversation turns, computed purely
from the archived `transcripts/session-NNN.jsonl` files with no additional
capture. Each turn MUST identify its direction so a request (agent-issued
prompt or tool call) is unambiguously distinguished from a response (tool
result or model output). The same rendering MUST be obtainable for any
already-archived run.

#### Scenario: Tool call rendered as request, result as response
- **WHEN** the renderer parses a session containing an `assistant` message with
  a `tool_use` block followed by a `user` message carrying the matching
  `tool_result`
- **THEN** it emits a `tool_use` turn tagged as a request (agent → environment)
  and a `tool_result` turn tagged as a response (environment → agent), linked by
  the tool-use id and preserving their original order

#### Scenario: Bootstrap noise excluded, init summarized
- **WHEN** the session contains `system` bootstrap/periodic events and a single
  `init` event
- **THEN** periodic/bootstrap `system` events are excluded from the conversation
  turns and the `init` event is surfaced once as a compact header (model, cwd,
  available tools), so the rendering reads as a conversation rather than a log
  dump

#### Scenario: Multi-session build reads as one ordered conversation
- **WHEN** a trial has multiple session steps (an initial prompt plus
  continuation prompts)
- **THEN** the renderer concatenates the sessions in order under labeled session
  headings, so the full back-and-forth of the build is replayable end to end

### Requirement: On-disk readable artifact
The system SHALL write a human-readable Markdown rendering alongside the raw
transcripts at archive time, so the conversation can be audited without running
the studio. Oversized payloads (file bodies, base64) MUST be truncated in the
Markdown with a size marker, while the raw `.jsonl` remains the unabridged
ground truth. A backfill command MUST be able to produce the rendering for
runs archived before this capability existed.

#### Scenario: Markdown emitted during archival
- **WHEN** a trial's artifacts are archived
- **THEN** a `transcripts/conversation.md` (and per-session `session-NNN.md`) is
  written, with request and response turns visually delineated, next to the
  unchanged `session-NNN.jsonl`

#### Scenario: Large payloads truncated, ground truth preserved
- **WHEN** a tool input or result exceeds the inline size cap
- **THEN** the Markdown shows a truncation marker naming the elided size and the
  source `.jsonl`, and the `.jsonl` itself is written in full (never truncated)

#### Scenario: Backfill existing runs
- **WHEN** `scripts/render-transcripts.ts <run-dir>` is run against a run
  archived before this capability
- **THEN** it writes `conversation.md`/`session-NNN.md` for each trial from the
  existing `.jsonl`, mutating no `.jsonl`, grades, or results

### Requirement: Renders only redacted content, judge unaffected
The transcript renderer SHALL read only the already-redacted archived
transcripts, introducing no new secret-egress path, and MUST NOT alter any
grading input. Framework markers are not scrubbed in this audit artifact, which
is distinct from the workspace-blind copy the code-quality judge reads.

#### Scenario: No raw secrets reach the rendering
- **WHEN** the renderer runs
- **THEN** it consumes the post-redaction `.jsonl` produced by the archiver, so
  any secret already redacted there is absent from the Markdown and the studio
  payload

#### Scenario: Judge neutrality preserved
- **WHEN** the audit rendering (which retains framework markers) exists for a
  trial
- **THEN** the blind code-quality judge still reads only the scrubbed
  `workspace-blind` copy, and the worker≠judge rule is unchanged

# live-build-stream Specification

## Purpose
TBD - created by archiving change add-live-build-stream. Update Purpose after archive.
## Requirements
### Requirement: Read-only live session tap
While a trial's harness session is running, the system SHALL expose the session's
in-progress output by reading the same sandbox file the driver already writes,
incrementally and append-only, WITHOUT altering the build. The tap SHALL NOT issue
any write into the workspace, SHALL NOT attach to or hold the build process's stdout
(preserving the file-redirect / daemon-stdout rule), and SHALL leave the post-exit
read and parse byte-identical so telemetry and the archived transcript are unchanged.

#### Scenario: Tap streams without mutating the build
- **WHEN** a trial is building and the live tap is reading the session file
- **THEN** the build's workspace and process are unaffected, and the trial's
  archived transcript and telemetry are identical to a run with no tap

#### Scenario: Tap is read-only on every provider
- **WHEN** the tap reads the session file (a host file under the worktree provider,
  or a remote read under a cloud provider)
- **THEN** it only reads bytes and never writes to the sandbox

### Requirement: Incremental multi-harness parse
The live stream SHALL parse the in-progress session into the same
role/direction-tagged turns as the post-hoc renderer, using one shared parser so the
live view and the archived replay cannot diverge, and SHALL support every harness
format the eval runs (at least Claude Code stream-json and Codex `exec --json`).
Partial trailing output (an incomplete final line) SHALL be held until complete
rather than emitted as malformed.

#### Scenario: Live turns match the archived replay
- **WHEN** a building trial's stream is parsed and later the same trial is replayed
  from its archived transcript
- **THEN** the turn sequence rendered live matches the post-hoc replay

#### Scenario: Incomplete trailing line is not emitted
- **WHEN** the tap reads up to a partial JSON line still being written
- **THEN** that partial line is buffered and only parsed once it is complete

### Requirement: Studio live stream transport with redaction
The studio SHALL provide an append-only stream (e.g. Server-Sent Events) of an
in-progress trial's parsed turns, bound to localhost. Secrets SHALL be redacted in
the streamed turns using the same rules as the archiver, so no credential is exposed
in the live view. The stream SHALL be per-trial and lifecycle-bound: it starts for a
building trial, ends when the trial completes, fails, or is cancelled, and leaves no
tap or open handle behind.

#### Scenario: Secrets redacted in the live stream
- **WHEN** the session output contains a value matching a known secret pattern or env secret
- **THEN** the streamed turn shows it redacted, identical to the archived redaction

#### Scenario: Stream ends and is cleaned up at trial end
- **WHEN** the trial completes, fails, or is cancelled
- **THEN** the stream closes and the tap is removed with no leaked handle or process

### Requirement: Live-to-archived handoff
When a streamed trial finishes, the studio SHALL transition the same view from the
live stream to the archived replay of that trial without losing or duplicating turns,
so a viewer who watched the build sees a consistent final transcript.

#### Scenario: Seamless handoff on completion
- **WHEN** a trial being watched live reaches a terminal state
- **THEN** the view switches to the archived transcript and the turn history is
  consistent (no missing or duplicated turns)


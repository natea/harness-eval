## MODIFIED Requirements

### Requirement: Trial conversation replay
The studio SHALL render a trial's build conversation through an interactive player:
playback (play/pause, step, variable speed), a timeline/chapter scrubber, and
collapsible tool-call groups, driven by the shared `transcript-render` turns (one
parser for live and archived). The player SHALL preserve secret redaction and SHALL
offer export of a self-contained replay (e.g. downloadable HTML). It SHALL degrade
gracefully to a readable turn list when player assets are unavailable.

#### Scenario: Replay a completed trial in the player
- **WHEN** the operator opens a completed trial's conversation
- **THEN** the session renders in the player with playback controls, a chapter
  timeline, and collapsible tool calls, and the turns match the archived transcript

#### Scenario: Export a self-contained replay
- **WHEN** the operator exports a trial's replay
- **THEN** a self-contained artifact (e.g. HTML) is produced with secrets redacted

### Requirement: Live build stream view
For a trial that is currently building, the studio SHALL present a Live panel that
renders the trial's session turns as they arrive from the live-build-stream
transport **in the same player** used for archived replay, reusing the live-run stage
indicator. When the trial reaches a terminal state, the panel SHALL hand off to the
archived replay for that trial (per the live-build-stream handoff requirement). The
Live panel SHALL be read-only, localhost-bound, keep secrets redacted, and SHALL
degrade gracefully (stage badge + archived replay) when no live stream is available.

#### Scenario: Watch a building trial live in the player
- **WHEN** the operator opens a trial that is currently building
- **THEN** the player streams the agent's turns (reasoning, commands, file changes,
  output) as they happen, with secrets redacted, and hands off to the archived replay
  on completion

#### Scenario: Falls back when no stream
- **WHEN** a trial is not building or no live stream is available
- **THEN** the panel shows the stage badge and the archived replay instead of an error

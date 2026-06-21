## ADDED Requirements

### Requirement: Live build stream view
For a trial that is currently building, the studio SHALL present a Live panel that
renders the trial's session turns as they arrive from the live-build-stream
transport, reusing the Conversation rendering and the live-run stage indicator. When
the trial reaches a terminal state, the panel SHALL hand off to the archived replay
for that trial (per the live-build-stream handoff requirement). The Live panel SHALL
be read-only and localhost-bound, and SHALL degrade gracefully (show the stage badge
and, once available, the archived replay) when no live stream is available.

#### Scenario: Watch a building trial live
- **WHEN** the operator opens a trial that is currently building
- **THEN** the Live panel streams the agent's turns (reasoning, commands, file
  changes, output) as they happen, with secrets redacted

#### Scenario: Falls back when no stream
- **WHEN** a trial is not building or no live stream is available
- **THEN** the panel shows the stage badge and the archived Conversation replay
  instead of an error

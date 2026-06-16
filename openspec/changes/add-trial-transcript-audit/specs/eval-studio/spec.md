# Delta: eval-studio — Conversation replay tab

## ADDED Requirements

### Requirement: Trial conversation replay
The studio Trial view SHALL provide a Conversation tab that replays a trial's
rendered transcript turns with request and response visually distinguished. It
MUST source the structured turns from the same renderer that produces the
on-disk Markdown, so the browser replay and the disk artifact cannot diverge.
Large tool payloads MUST be collapsible, and a per-turn cost/token figure SHALL
be shown where the transcript records it.

#### Scenario: Replay distinguishes request from response
- **WHEN** an operator opens the Conversation tab for an archived trial
- **THEN** the view renders the ordered turns with agent-issued prompts and tool
  calls shown as requests and tool results / model output shown as responses,
  each labeled by role and direction

#### Scenario: Oversized tool payloads collapsed
- **WHEN** a turn carries a large tool input or result
- **THEN** the payload is collapsed by default and expandable on demand, so the
  conversation stays readable

#### Scenario: Served from the shared renderer
- **WHEN** the studio requests a trial's conversation
- **THEN** the turns are produced by the same parser that writes
  `conversation.md`, so the studio replay and the on-disk Markdown reflect the
  identical turn sequence

### Requirement: Trial conversation navigation
The Conversation replay SHALL be navigable without linear scrolling: the Trial
view MUST provide jump targets to its major sections and, within the
conversation, to each session, to errored turns, and through an outline of the
agent's narration. From a graded step whose outcome is not a full pass, the
operator SHALL be able to jump directly to the conversation turn that best
explains that outcome, so "why did this fail / get partial credit" is one click
from the score, not a manual scroll.

#### Scenario: Jump from a partial/failed step to the explaining turn
- **WHEN** an operator activates the trace control on an adherence step that
  scored partial or fail
- **THEN** the studio opens the Conversation replay and scrolls to the build
  turn that best matches the step's evidence (the tokens the evaluator probed
  for), highlighting it; if no turn matches, it scrolls to the conversation
  section rather than doing nothing

#### Scenario: Navigate a long transcript
- **WHEN** the conversation is long
- **THEN** the operator can jump to any session, step through errored turns, and
  open an outline of narration "chapters", each entry scrolling to its turn

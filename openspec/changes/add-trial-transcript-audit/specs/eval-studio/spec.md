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

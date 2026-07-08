# Spec Delta: eval-studio

## ADDED Requirements

### Requirement: Per-page document title
The studio SHALL set the browser document title to a value that names the project and the current page, of the form `CodingHarness — <page>` (for example `CodingHarness — Inverse-scaling`), so browser tabs and bookmarks are distinguishable and carry the project name. A sensible default title SHALL apply before the client renders.

#### Scenario: Each page sets its own title
- **WHEN** a studio page is opened (Review, Configure, Inverse-scaling, Bracket, Runs, a run, or a trial)
- **THEN** the document title reads `CodingHarness — <that page>` so a bookmark of the page is self-describing

### Requirement: Inverse-scaling drill-through to contributing trials
The inverse-scaling view SHALL let an operator expand any row to reveal the individual graded trials behind the cell — grouped into the framework side and the baseline side — each showing its scores and linking to that trial's scorecard. Rows SHALL be collapsed by default and expandable independently.

#### Scenario: Expanding a row reveals its trials with links
- **WHEN** an operator expands an inverse-scaling row
- **THEN** the framework trials and baseline trials are listed with their adherence and quality, and each trial links to its trial page (`/runs/<runId>/trials/<trialId>`)

#### Scenario: A side with no linkable trial degrades gracefully
- **WHEN** a contributing trial has no resolvable trial id
- **THEN** it is still listed (non-linked) rather than omitted, so the count of sources stays honest

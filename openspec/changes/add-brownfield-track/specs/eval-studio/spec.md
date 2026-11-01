# Spec Delta: eval-studio — brownfield task review

## MODIFIED Requirements

### Requirement: Scoped writes only
The studio server SHALL write nothing except run operations through the orchestrator's public entry points: enqueuing/executing runs (dry or real) and the resulting run-directory artifacts the orchestrator itself writes (provenance, telemetry, grades, results, scorecard). The studio's own endpoints SHALL never create, modify, or delete run artifacts, grades, or reports directly. The single exception is the brownfield task review endpoint, which SHALL only append human review records to a task bundle's `review/labels.jsonl` and SHALL never modify or delete existing records or any other bundle file. The server SHALL bind to localhost by default.

#### Scenario: No artifact mutation surface
- **WHEN** any studio endpoint other than launch/cancel or the review-label append endpoint is invoked
- **THEN** it performs only reads of run directories, task bundles, and orchestrator state and mutates no artifact

#### Scenario: Real run writes only through the orchestrator
- **WHEN** a real run executes and produces provenance, telemetry, grades, results, and a scorecard
- **THEN** those artifacts are written by the orchestrator's entry points, and no studio endpoint writes or edits them directly

#### Scenario: Review labels are append-only
- **WHEN** a reviewer submits labels for a task
- **THEN** one record is appended to that bundle's `review/labels.jsonl`, no existing line changes, and no other bundle file's hash changes

## ADDED Requirements

### Requirement: Brownfield task review view
The studio SHALL provide a task review view listing brownfield task bundles with validation verdict and, once a task is reviewed, its LLM leak strata, showing a selected task's issue variants, reference patch, and hidden test patch side by side. The reviewer SHALL assign a leak level to the body and each retained comment, and a test-fairness verdict (yes / no / unsure, with a note). Bot authorship SHALL be visible.

#### Scenario: Review a task
- **WHEN** a reviewer opens a task bundle in the review view
- **THEN** the issue text, comments with author roles and bot tags, reference patch, and test patch are displayed, and labels can be entered from the keyboard

### Requirement: Blind labeling and agreement
LLM leak labels SHALL be hidden in the review view until the reviewer has submitted labels for that task. After submission the view SHALL show per-item agreement with the classifier, and a summary view SHALL report agreement across reviewed tasks (including Cohen's κ for leak levels) and list disagreements.

#### Scenario: Classifier labels hidden before submission
- **WHEN** a reviewer opens an unreviewed task
- **THEN** no LLM label, evidence, or rationale is visible until labels are submitted

#### Scenario: Agreement summary
- **WHEN** at least one task has both human and LLM labels
- **THEN** the summary shows per-level agreement, Cohen's κ, and links to each disagreeing item

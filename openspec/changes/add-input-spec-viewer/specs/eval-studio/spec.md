# Spec Delta: eval-studio

## ADDED Requirements

### Requirement: Input-spec panel on the run view
The run view SHALL provide a panel that shows the PRD and test plan the run was graded against, fetched from the input-spec endpoint, rendered as text without mutating anything. When the run's frozen PRD does not match any current target, the panel SHALL show that notice instead of a substitute document.

#### Scenario: Read the spec a run was graded against
- **WHEN** a reviewer opens a run whose PRD hash matches a current target and expands the spec panel
- **THEN** the panel shows that target's PRD and test-plan text

#### Scenario: Panel reflects a re-frozen PRD
- **WHEN** the run's frozen PRD matches no current target
- **THEN** the panel shows the not-available notice rather than a substitute PRD

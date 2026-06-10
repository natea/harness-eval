# Delta: grading-rubric — per-target test plans and fixtures

## MODIFIED Requirements

### Requirement: Frozen PRD-adherence test plan
The system SHALL grade PRD adherence against a versioned, frozen test plan resolved from the selected eval target (`targets/<name>/testplan.yaml`). The plan SHALL assign each step an identifier, weight, and observable check, MAY mark steps fatal or bonus, and MUST NOT change within a run; the run SHALL record the plan's content hash. Coverage SHALL be validated per the target's coverage mode: in `spec-checklist` mode every REQUIRED item of the PRD's own conformance checklist maps to at least one non-bonus step (validated programmatically); in `attested` mode the target carries a human coverage attestation recorded in provenance.

#### Scenario: Test plan freeze
- **WHEN** a graded run starts
- **THEN** the run records the content hash of the selected target's test plan, and every trial in the run is graded against that identical plan

#### Scenario: Checklist coverage (spec-checklist targets)
- **WHEN** a `spec-checklist` target (e.g. symphony-daemon) is validated
- **THEN** every REQUIRED conformance item maps to at least one non-bonus test-plan step, and OPTIONAL items are marked as non-scoring bonus

#### Scenario: Per-target fixtures drive evaluation
- **WHEN** the evaluator grades a trial
- **THEN** the fixture processes declared in the target manifest (e.g. mock tracker, stub app-server, HTTP harness) are started for that trial, exposed to the evaluator via declared env vars, and stopped afterward

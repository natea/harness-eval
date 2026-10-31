# Spec Delta: eval-reporting — brownfield report

## ADDED Requirements

### Requirement: Brownfield report with human baseline
Brownfield reports SHALL show, per task, each candidate's raw wall-clock minutes and USD for resolved trials beside the task's human baseline (coding window, review time, review rounds, human diff size), noting that the coding window comes from client-supplied commit dates. Reports SHALL NOT state counterfactual merge-time savings and SHALL NOT convert human time to cost.

#### Scenario: Report row
- **WHEN** a candidate resolves a task
- **THEN** the report row shows the candidate's minutes and USD next to the human coding window and review time for that task

### Requirement: Cassette-miss sensitivity
Brownfield reports SHALL list trials flagged `cassette-miss` and SHALL show each candidate's resolution rate both as scored and with those trials excluded.

#### Scenario: Flagged trials present
- **WHEN** a run has trials flagged `cassette-miss`
- **THEN** the report lists them and shows each candidate's resolution rate as scored and excluding them

# Spec Delta: inverse-scaling-report

## ADDED Requirements

### Requirement: Per-cell trial provenance for drill-through
Each reported cell SHALL carry the individual graded trials that assembled each side of the comparison — the framework side and the baseline side — so a consumer can audit the aggregate down to its sources. For every contributing trial the report SHALL expose its run id, its trial id, and the trial's adherence and code-quality scores, with code quality expressed on the same 0–100 scale as the cell's reported quality. This provenance SHALL be additive and SHALL NOT change the cell's aggregated values, fit, or flags.

#### Scenario: Trials behind a cell are exposed
- **WHEN** a cell is built from one or more framework trials and one or more baseline trials
- **THEN** the cell exposes both lists of trials, each with its run id, trial id, and adherence + quality, and the aggregated adherence/quality/gain for the cell are unchanged

#### Scenario: Provenance covers assembled-across-runs cells
- **WHEN** a cell is assembled from trials spanning more than one run
- **THEN** every contributing trial appears in the cell's provenance with the run id it came from, so the assembly is fully auditable

# Spec Delta: inverse-scaling-report

## ADDED Requirements

### Requirement: Marginal harness gain over a like-for-like baseline
The system SHALL compute, for a framework candidate on a given worker model within a fixed target, its marginal gain as the difference between its absolute PRD-adherence score and the absolute PRD-adherence score of the no-framework baseline candidate on the same model, harness, and target. When no like-for-like baseline cell exists for a (model, target), that cell SHALL be omitted with a recorded reason rather than compared against a mismatched baseline.

#### Scenario: Marginal gain is computed against the matching baseline
- **WHEN** a framework and the no-framework baseline both have graded trials on the same model, harness, and target
- **THEN** the framework's marginal gain is its absolute PRD-adherence minus the baseline's, and the baseline's absolute score is recorded as that model's baseline strength

#### Scenario: Missing baseline is omitted, not faked
- **WHEN** a framework has results on a (model, target) but no baseline candidate does
- **THEN** that cell is omitted from the report with a recorded reason, not compared against a baseline from a different model or target

### Requirement: Report uses absolute, cross-run-comparable dimensions only
The report SHALL use only absolute 0–100 dimensions (PRD-adherence, code quality). It SHALL NOT use the weighted composite or the speed/token-spend dimensions, which are min-max normalized within a single run and are therefore not comparable across runs or models.

#### Scenario: Run-relative dimensions are excluded
- **WHEN** the report assembles marginal gains across runs and models
- **THEN** it reads only the absolute PRD-adherence and code-quality scores, and never the composite or the run-normalized speed/token-spend values

### Requirement: Inverse-scaling relationship reported per target
The system SHALL present, per target, the marginal harness gain against baseline model strength across the harness × model matrix — as a table and a chart plotting baseline strength on one axis and marginal gain on the other — and SHALL report the observed relationship (e.g. the slope) without pooling across targets, since different targets have different difficulty ceilings.

#### Scenario: Per-target inverse-scaling view
- **WHEN** a target has framework and baseline cells across multiple models
- **THEN** the report shows, for that target, each framework's marginal gain versus baseline strength and states the observed relationship, separately per target rather than pooled

### Requirement: Statistical and held-out honesty
Cells assembled from too few trials SHALL be flagged inconclusive and carry their variance rather than being presented as a trend, and the report SHALL disclose that gains are measured on the evaluation set (not held-out tasks).

#### Scenario: Thin cells and the held-out caveat are surfaced
- **WHEN** a marginal-gain cell is computed from few trials, or the report is presented
- **THEN** the thin cell is flagged inconclusive with its variance, and the report states that the gains are measured on the eval set, not on held-out tasks

# Spec Delta: task-curation

## Purpose

Produce each brownfield task bundle's curation labels at mine time: leak levels, test fairness, eligibility flags, and difficulty. Labels come from interchangeable arms (single agent, central controller, decentralized collective), are frozen into the bundle with provenance, and are compared against blind human labels at equal budget.

## ADDED Requirements

### Requirement: Interchangeable curation arms
The curation step SHALL support three arms that produce the same output schema: `single` (one agent given all curation evidence), `controller` (one planner agent that delegates to role agents and writes the final labels), and `collective` (role agents whose verdicts are combined by the quorum rule, with no agent writing final labels). Each invocation SHALL run one named arm over a set of bundles.

#### Scenario: Same schema from every arm
- **WHEN** the `single`, `controller`, and `collective` arms each curate the same bundle
- **THEN** each writes labels in the same schema, so downstream consumers can read any arm's output without changes

### Requirement: Curation decisions
For each bundle, an arm SHALL decide: a leak level (`noise`, `symptom`, `diagnosis`, `fix_sketch`, `fix_code`) for the body and each retained comment, with verbatim evidence, consistency with the reference, and the reference files revealed; a test-fairness verdict (`fair`, `unfair`, `unsure`) with a reason; eligibility flags (tests to exclude, `appEgress` need); and a difficulty stratum.

#### Scenario: Leak item matches the existing schema
- **WHEN** an arm labels a comment
- **THEN** the item carries `id`, `label`, `consistent_with_reference`, `reveals_files`, `evidence`, and `rationale`, as in the brownfield leak classification

### Requirement: Role evidence isolation
In the `controller` and `collective` arms, each role agent SHALL receive only its declared evidence. The issue reader receives the issue at T* only. The gold comparer receives the issue and the reference patch. The test auditor receives the tests patch and validation results. The history agent receives repository history reachable from the base commit. No role agent SHALL receive another role's private evidence except through posted verdicts.

#### Scenario: Issue reader is blind to the fix
- **WHEN** the issue reader runs
- **THEN** its input contains no reference patch, tests patch, or commit after the base, which the recorded input manifest shows

#### Scenario: History limited to the base commit
- **WHEN** the history agent runs
- **THEN** it can reach no commit after the base, as checked against the sealed repository

### Requirement: Shared verdict record
In the `collective` arm, role agents SHALL post typed verdicts (decision, value, confidence, evidence pointer, optional objection to another verdict) to an append-only record that every role agent can read. Each agent SHALL get at most one revision round after reading the others' verdicts.

#### Scenario: Objection and revision
- **WHEN** the issue reader posts that it could not locate the fix from the issue and the gold comparer has labeled the body `diagnosis`
- **THEN** the gold comparer may post one revised verdict citing the objection, and both verdicts stay in the record

### Requirement: Fixed quorum rule
The `collective` arm's final labels SHALL be computed from the verdict record by a deterministic rule that is declared before the run, with its hash recorded. Leak-level ties SHALL resolve to the higher level. A test-fairness verdict of `fair` SHALL require agreement from the test auditor and the gold comparer; otherwise the verdict is `unsure` or `unfair`.

#### Scenario: Tie resolves conservatively
- **WHEN** role verdicts on an item split evenly between `symptom` and `diagnosis`
- **THEN** the final label is `diagnosis`

#### Scenario: Rule changed
- **WHEN** the quorum rule's hash differs from the one recorded in a bundle's curation output
- **THEN** the curation output is treated as stale and must be regenerated before runs use it

### Requirement: Equal budget across arms
Every arm SHALL run under the same per-bundle token and USD cap. Actual spend per arm and bundle SHALL be recorded. An arm that exceeds the cap on a bundle SHALL be marked `over-budget` for that bundle and excluded from the comparison for it.

#### Scenario: Cap exceeded
- **WHEN** the controller arm exceeds the per-bundle cap
- **THEN** its labels for that bundle are marked `over-budget`, its spend is recorded, and that bundle is excluded from the controller arm's comparison scores

### Requirement: Frozen curation output with provenance
Each arm's output SHALL be written into the bundle with a provenance block (arm, models, prompt hashes, quorum-rule hash, per-agent verdicts, spend) and included in the bundle's file hashes. A run SHALL record which arm's labels it uses. Curation SHALL NOT run during trials.

#### Scenario: Run uses frozen labels
- **WHEN** a brownfield run starts with `--curation collective`
- **THEN** it reads the collective arm's frozen output, records the arm in provenance, and makes no curation model calls

### Requirement: Model independence
Every model used by any agent in an arm SHALL differ from the worker model of any run that uses that arm's labels.

#### Scenario: Collective model equals worker
- **WHEN** a run's worker model is used by any role agent in the chosen arm
- **THEN** run validation fails, naming the conflicting agent and model

### Requirement: Comparison against human labels
A comparison report SHALL score each arm against blind human labels from Studio review, over items and bundles that have human labels: per-level accuracy, Cohen's κ for leak levels, test-fairness agreement, and spend per bundle. Arms SHALL be scored only on bundles where every compared arm is within budget.

#### Scenario: Report with three arms
- **WHEN** 20 bundles have human labels and all three arms are within budget on them
- **THEN** the report lists accuracy, κ, fairness agreement, and mean spend for each arm over those 20 bundles, plus the per-item disagreements

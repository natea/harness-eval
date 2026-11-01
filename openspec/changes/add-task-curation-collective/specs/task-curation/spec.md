# Spec Delta: task-curation

## Purpose

Produce each brownfield task bundle's curation labels at mine time: leak levels, test fairness, advisory eligibility flags, and difficulty. Labels come from interchangeable arms (single agent, central controller, decentralized collective), are frozen into the bundle with provenance, and are compared against blind human labels under one spend cap.

## ADDED Requirements

### Requirement: Interchangeable curation arms
The curation step SHALL support three arms that produce the same output schema: `single` (one agent given all curation evidence), `controller` (one planner agent that delegates to role agents and writes the final labels), and `collective` (role agents whose verdicts are combined by the quorum rule, with no agent writing final labels). Each invocation SHALL run one named arm over a set of bundles.

#### Scenario: Same schema from every arm
- **WHEN** the `single`, `controller`, and `collective` arms each curate the same bundle
- **THEN** each writes labels in the same schema, so downstream consumers can read any arm's output without changes

### Requirement: Curation decisions
For each bundle, an arm SHALL decide: a leak level (`noise`, `symptom`, `diagnosis`, `fix_sketch`, `fix_code`) for the body and each retained comment, with verbatim evidence, consistency with the reference, and the reference files revealed; a test-fairness verdict (`fair`, `unfair`, `unsure`) with a reason; eligibility flags (tests proposed for exclusion, `appEgress` need); and a `difficulty` of `easy`, `medium`, or `hard`, distinct from the brownfield `leakStratum`.

#### Scenario: Leak item matches the existing schema
- **WHEN** an arm labels a comment
- **THEN** the item carries `id`, `label`, `consistent_with_reference`, `reveals_files`, `evidence`, and `rationale`, as in the brownfield leak classification

### Requirement: Advisory eligibility flags
Eligibility flags from curation SHALL be advisory: they SHALL be surfaced for human review and SHALL NOT change a task's scored test set, trial setup, or grading. The deterministic validator SHALL remain the authority on flaky and env-broken tests.

#### Scenario: Curation proposes excluding a test
- **WHEN** an arm flags a FAIL_TO_PASS test for exclusion
- **THEN** the flag appears in review and the test stays in the scored set unless the bundle is deliberately re-frozen

### Requirement: Role evidence isolation
In the `controller` and `collective` arms, each role agent SHALL receive only its declared evidence. The issue reader receives the issue at T* only. The gold comparer receives the issue at T* and the reference patch. The test auditor receives the issue at T*, the tests patch, and validation results. The history agent receives repository history reachable from the base commit. No role agent SHALL receive another role's private evidence except through posted verdicts.

#### Scenario: Issue at T* is the full thread
- **WHEN** any role receives the issue at T*
- **THEN** it receives the snapshot's full retained thread (body and every retained comment, bots tagged), not a run's prompt variant

#### Scenario: Issue reader is blind to the fix
- **WHEN** the issue reader runs
- **THEN** its input contains no reference patch, tests patch, commit after the base, or other role's verdict, which the recorded input manifest shows

#### Scenario: Test auditor sees the issue
- **WHEN** the test auditor judges fairness
- **THEN** its input contains the issue at T* along with the tests patch and validation results

#### Scenario: History limited to the base commit
- **WHEN** the history agent runs
- **THEN** it can reach no commit after the base, as checked against the sealed repository

### Requirement: Blind localization on cumulative prefixes
The issue reader SHALL run once per cumulative prefix of the retained thread in posting order (body, then body plus each successive comment), predicting up to five non-test files per prefix. A prefix SHALL count as localizing when its predictions include every non-test file of the reference patch.

#### Scenario: Location revealed by the body
- **WHEN** the issue reader's predictions for the body prefix include every non-test reference file
- **THEN** the body prefix is recorded as localizing

### Requirement: Issue reader votes
The issue reader's vote for an item SHALL be `diagnosis` when that item's prefix is the first to localize, `symptom` when its prefix does not localize, and an abstention when an earlier prefix already localized. The issue reader SHALL never vote above `diagnosis`.

#### Scenario: Comment reveals the location
- **WHEN** the body prefix does not localize and the prefix ending at comment c2 does
- **THEN** the issue reader votes `symptom` on the body and c1, `diagnosis` on c2, and abstains on later comments

### Requirement: Shared verdict record
In the `collective` arm, role agents SHALL post typed verdicts (round, decision, value, confidence, evidence pointer, optional objection to another verdict) to an append-only record. Round 1 SHALL run every role on its own evidence. In round 2, every role except the issue reader SHALL read the record and MAY post at most one revision or objection. The issue reader's votes SHALL come from round 1 only.

#### Scenario: Objection and revision
- **WHEN** the test auditor posts that the body names the tested function and the gold comparer has labeled the body `symptom`
- **THEN** the gold comparer may post one revised verdict citing the objection, and both verdicts stay in the record

#### Scenario: Issue reader excluded from round 2
- **WHEN** round 2 runs
- **THEN** the issue reader is not invoked, and its round-1 votes are the ones the quorum rule uses

### Requirement: Fixed quorum rule
The `collective` arm's final labels SHALL be computed from the verdict record by a deterministic rule that is declared before the run, with its hash recorded.

#### Scenario: Rule changed
- **WHEN** the quorum rule's hash differs from the one recorded in a bundle's curation output
- **THEN** the curation output is treated as stale and must be regenerated before runs use it

### Requirement: Leak-level quorum
Each item's leak level SHALL be the median of the non-abstaining role votes, taking each role's latest vote. When the vote count is even, the median SHALL resolve to the higher of the two middle levels. If the gold comparer marks an item inconsistent with the reference, the final label SHALL be at most `symptom`. If the gold comparer cast no vote on an item, the item SHALL be `unlabeled`.

#### Scenario: Even split resolves higher
- **WHEN** the issue reader abstains on an item and the other two votes are `symptom` and `diagnosis`
- **THEN** the final label is `diagnosis`

#### Scenario: Gold cap on a wrong guess
- **WHEN** the issue reader and test auditor vote `diagnosis` on a bot comment and the gold comparer labels it `symptom` with `consistent_with_reference: false`
- **THEN** the final label is `symptom`

### Requirement: Fairness quorum
A test-fairness verdict of `fair` SHALL require agreement from the test auditor and the gold comparer. Otherwise the verdict SHALL be `unfair` if either says unfair, else `unsure`.

#### Scenario: Gold comparer unsure
- **WHEN** the test auditor says `fair` and the gold comparer says `unsure`
- **THEN** the fairness verdict is `unsure`

### Requirement: Shared spend cap across arms
Every arm SHALL run under the same per-bundle token and USD cap. Actual spend per arm and bundle SHALL be recorded. An arm that exceeds the cap on a bundle SHALL be marked `over-budget` for that bundle, excluded from the shared-bundle comparison, and counted in that arm's reported exclusions.

#### Scenario: Cap exceeded
- **WHEN** the controller arm exceeds the per-bundle cap
- **THEN** its labels for that bundle are marked `over-budget`, its spend is recorded, that bundle is excluded from the shared comparison, and the controller's exclusion count includes it

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
A comparison report SHALL score each arm against blind human labels from Studio review, over items and bundles that have human labels. It SHALL report per arm: per-level accuracy, Cohen's κ for leak levels, test-fairness agreement, spend per bundle, accuracy per dollar, and `over-budget` exclusion count. Arms SHALL be compared on bundles where every compared arm is within the cap.

#### Scenario: Report with three arms
- **WHEN** 14 bundles have human labels and all three arms are within the cap on them
- **THEN** the report lists accuracy, κ with bundle-bootstrap CIs, fairness agreement, mean spend, and accuracy per dollar for each arm over those 14 bundles, plus per-role vote accuracy and the per-item disagreements

### Requirement: Comparison statistics
The comparison report SHALL also give each role's vote accuracy against the human labels, confidence intervals from a bootstrap that resamples bundles rather than items, and the number of human labelers.

#### Scenario: Single labeler
- **WHEN** every human label comes from one reviewer
- **THEN** the report states that no human-to-human agreement ceiling is available

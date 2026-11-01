# Spec Delta: grading-rubric — brownfield resolution

## ADDED Requirements

### Requirement: Hidden-test resolution grading
Brownfield trials SHALL be graded by applying the task's hidden test patch to the candidate's final tree (hidden test files replace any candidate edits to the same paths) and running the task's offline test command. A trial is **resolved** when every FAIL_TO_PASS test passes and every PASS_TO_PASS test passes. Env-broken and flaky tests from validation SHALL NOT affect the result. Resolution SHALL feed the adherence dimension of the weighted composite for brownfield runs.

#### Scenario: Correct but different fix
- **WHEN** a candidate's change differs textually from the reference but makes all FAIL_TO_PASS tests pass without breaking PASS_TO_PASS
- **THEN** the trial is resolved

#### Scenario: Candidate edited the hidden test file
- **WHEN** the candidate modified a test file that the hidden test patch also touches
- **THEN** the hidden version is applied over it before tests run

### Requirement: Test-infrastructure restoration
Before the hidden test patch is applied, test infrastructure in the candidate's tree SHALL be restored to the base commit: the test paths recorded in the task bundle, every `conftest.py`, and pytest configuration files and sections. Any candidate modification of these SHALL be recorded as `test-infra-modified` for review.

#### Scenario: Candidate edited test infrastructure
- **WHEN** the candidate modified a `conftest.py` or pytest configuration that the hidden test patch does not touch
- **THEN** that file is restored to its base version before tests run and the trial is flagged `test-infra-modified`

#### Scenario: Nested test directory
- **WHEN** a bundle records `tests/` and `packages/*/tests` as its test paths and the candidate edited a file under `packages/core/tests/`
- **THEN** that file is restored to its base version and the trial is flagged `test-infra-modified`

### Requirement: Cassette-miss handling
A scored test SHALL be recorded as `cassette-miss` when it fails because a request had no recorded fixture: either the recorder raises its replay-only error (e.g. vcrpy `CannotOverwriteExistingCassetteException`) or the request fails at the blocked offline proxy (e.g. `APIConnectionError` or `ProxyError`). A trial with any `cassette-miss` SHALL be scored unresolved and flagged for review.

#### Scenario: Blocked-proxy miss
- **WHEN** a FAIL_TO_PASS test fails with a `ProxyError` from the offline proxy
- **THEN** the test is recorded as `cassette-miss`, the trial is unresolved, and it is flagged for review

#### Scenario: Replay-only recorder miss
- **WHEN** a test fails with the recorder's replay-only exception
- **THEN** the test is recorded as `cassette-miss`, with the same scoring

### Requirement: Secondary brownfield signals
Brownfield grading SHALL additionally record, without overriding resolution: an LLM judge verdict given the issue, reference patch, and candidate patch (`equivalent`, `better`, `partial`, `wrong`, plus fit with repository conventions), file-level localization precision and recall against the reference, and the candidate-to-reference diff-size ratio. The judge model SHALL differ from the worker model.

#### Scenario: Judge disagrees with tests
- **WHEN** the judge rates a resolved trial `wrong`
- **THEN** the trial remains resolved and the disagreement is surfaced for review

### Requirement: Code-quality comparison against the merged PR
Brownfield grading SHALL score each scored trial's patch and the human PR merged for the same issue on one rubric (correctness, scope, clarity, codebase fit, robustness, tests; 0–10 per side). The human side SHALL be the merged PR as submitted (reference patch plus test patch). The judge model SHALL differ from the worker model, and the comparison SHALL NOT change the resolution verdict.

#### Scenario: Stored per trial
- **WHEN** a trial is compared
- **THEN** `quality.json` records per-criterion scores and samples for both sides, overall scores (0–100), the preference and votes, the judge model, and the cost

#### Scenario: Not compared
- **WHEN** a trial was disqualified, infra-failed, or produced no patch
- **THEN** no comparison is made for it

### Requirement: Blind, position-balanced quality judging
The quality comparison SHALL show the judge two diffs labelled only A and B, never indicating which is human. Samples SHALL alternate which side is A; per-criterion scores SHALL be medians over samples and the preference a majority vote.

#### Scenario: Position bias cancels
- **WHEN** a judge always prefers whichever diff is shown first
- **THEN** each side gets one vote per pair of samples, and the comparison reports a tie with equal scores

#### Scenario: Authorship hidden
- **WHEN** the comparison prompt is rendered
- **THEN** it names the diffs only as PR A and PR B

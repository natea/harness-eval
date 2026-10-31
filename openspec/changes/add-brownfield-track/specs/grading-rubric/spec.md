# Spec Delta: grading-rubric — brownfield resolution

## ADDED Requirements

### Requirement: Hidden-test resolution grading
Brownfield trials SHALL be graded by applying the task's hidden test patch to the candidate's final tree (hidden test files replace any candidate edits to the same paths), and running the task's offline test command. A trial is **resolved** when every FAIL_TO_PASS test passes and every PASS_TO_PASS test passes. Env-broken and flaky tests from validation SHALL NOT affect the result. Resolution SHALL feed the adherence dimension of the weighted composite for brownfield runs.

#### Scenario: Correct but different fix
- **WHEN** a candidate's change differs textually from the reference but makes all FAIL_TO_PASS tests pass without breaking PASS_TO_PASS
- **THEN** the trial is resolved

#### Scenario: Candidate edited the hidden test file
- **WHEN** the candidate modified a test file that the hidden test patch also touches
- **THEN** the hidden version is applied over it before tests run

### Requirement: Test-infrastructure restoration
Before the hidden test patch is applied, test infrastructure in the candidate's tree (test directories, every `conftest.py`, and pytest configuration files and sections) SHALL be restored to the base commit, and any candidate modification of it SHALL be recorded as `test-infra-modified` for review. A test failing on a request with no recorded fixture SHALL be recorded as `cassette-miss` and surfaced for review.

#### Scenario: Request without a recording
- **WHEN** a candidate's fix makes an HTTP request that no recorded fixture covers
- **THEN** the failing test is recorded as `cassette-miss` and the trial is surfaced for review

#### Scenario: Candidate edited test infrastructure
- **WHEN** the candidate modified a `conftest.py` or pytest configuration that the hidden test patch does not touch
- **THEN** that file is restored to its base version before tests run and the trial is flagged `test-infra-modified`

### Requirement: Brownfield report with human baseline
Brownfield reports SHALL show, per task, each candidate's raw wall-clock minutes and USD for resolved trials beside the task's human baseline (coding window, review time, review rounds, human diff size). Reports SHALL NOT state counterfactual merge-time savings and SHALL NOT convert human time to cost.

#### Scenario: Report row
- **WHEN** a candidate resolves a task
- **THEN** the report row shows the candidate's minutes and USD next to the human coding window and review time for that task

### Requirement: Secondary brownfield signals
Brownfield grading SHALL additionally record, without overriding resolution: an LLM judge verdict given the issue, reference patch, and candidate patch (`equivalent`, `better`, `partial`, `wrong`, plus fit with repository conventions), file-level localization precision and recall against the reference, and the candidate-to-reference diff-size ratio. The judge model SHALL differ from the worker model.

#### Scenario: Judge disagrees with tests
- **WHEN** the judge rates a resolved trial `wrong`
- **THEN** the trial remains resolved and the disagreement is surfaced for review

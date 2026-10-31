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

### Requirement: Secondary brownfield signals
Brownfield grading SHALL additionally record, without overriding resolution: an LLM judge verdict given the issue, reference patch, and candidate patch (`equivalent`, `better`, `partial`, `wrong`, plus fit with repository conventions), file-level localization precision and recall against the reference, and the candidate-to-reference diff-size ratio. The judge model SHALL differ from the worker model.

#### Scenario: Judge disagrees with tests
- **WHEN** the judge rates a resolved trial `wrong`
- **THEN** the trial remains resolved and the disagreement is surfaced for review

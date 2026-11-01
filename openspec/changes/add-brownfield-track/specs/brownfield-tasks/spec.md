# Spec Delta: brownfield-tasks

## ADDED Requirements

### Requirement: Task mining from merged PRs
The miner SHALL enumerate merged pull requests of a configured repository that close at least one issue (via closing-issue references) and SHALL produce one candidate per PR ↔ same-repository issue pair. Candidates whose closing issue belongs to another repository, whose PR changes no non-test code, or whose PR changes no test code SHALL be rejected with a recorded reason.

#### Scenario: Cross-repository issue rejected
- **WHEN** a merged PR's closing reference points at an issue in a different repository
- **THEN** the candidate is rejected with reason `cross-repo-issue` and no bundle is produced

#### Scenario: Documentation-only PR rejected
- **WHEN** a merged PR changes only documentation or only test files
- **THEN** the candidate is rejected with reason `no-src-code-change` or `no-test-change`

### Requirement: Dependency changes decided by validation
A PR that changes the dependency lockfile or dependency declarations SHALL be flagged `deps-touched`, and SHALL be rejected as `dependency-change` only if the reference patch fails validation in the base environment.

#### Scenario: Dependency-changing PR rejected
- **WHEN** a merged PR adds a dependency the base environment lacks and the gold runs fail there
- **THEN** the candidate is rejected with reason `dependency-change`, because the offline base environment cannot install the new dependency

#### Scenario: Dependency touched but not needed
- **WHEN** a merged PR tightens a pin or edits the lockfile, and the gold runs pass in the base environment
- **THEN** the candidate stays eligible and is flagged `deps-touched` for review

### Requirement: Human baseline timings
For each accepted task the miner SHALL record, from the PR's commits, reviews, and timeline: the coding window (T* to the last PR commit before the first submitted review, or before merge if the PR was never reviewed), the review time (PR creation to merge), the number of submitted reviews, the number of commits after the first review, the issue lifetime (issue creation to merge), and the non-test size of the human diff (lines added, lines removed, files touched).

#### Scenario: Reviewed PR
- **WHEN** a PR received its first review after three commits and two more commits followed
- **THEN** the coding window ends at the third commit and `commitsAfterFirstReview` is 2

#### Scenario: Unreviewed PR
- **WHEN** a PR was merged without any submitted review
- **THEN** the coding window ends at the last commit before merge and `reviewRounds` is 0

### Requirement: Fix-start cutoff (T*)
For each candidate the miner SHALL compute T* as one second before the earliest of: the PR's creation time, the earliest author or committer date among the PR's commits, and the first cross-reference or connection event from the PR on the issue. The signal that set T* SHALL be recorded. A candidate whose issue was created after T* SHALL be rejected with reason `issue-after-fix-start`.

#### Scenario: Commits predate the PR
- **WHEN** the PR's first commit is dated before the PR was opened
- **THEN** T* is derived from the first commit and the bundle records `cutBy: firstPrCommit`

#### Scenario: Issue opened after work began
- **WHEN** the issue's creation time is later than T*
- **THEN** the candidate is rejected with reason `issue-after-fix-start`

### Requirement: Issue reconstruction at T*
The snapshotter SHALL reconstruct the issue as it read at T*: title from rename events; body and comment text from content edit history (latest edit at or before T*, else the original); labels, assignees, milestone and state from timeline events; and only comments created at or before T*.

#### Scenario: Body edited after the fix
- **WHEN** the issue body was edited after T* (e.g. to add "fixed in #N")
- **THEN** the rendered body is the version in effect at T*, without the later edit

#### Scenario: Comment posted after the fix started
- **WHEN** a comment was created after T*
- **THEN** it does not appear in any rendered issue variant

#### Scenario: Edit-history self-check
- **WHEN** an issue or comment has edit history
- **THEN** the snapshotter verifies the newest edit equals the live text and records a failure instead of silently trusting the history

### Requirement: Comment attribution and offline assets
Each retained comment SHALL record its author and whether the author is a bot account. Images referenced by retained text SHALL be stored in the bundle. Rendered issue files SHALL NOT link to the fixing PR or to commits after the base commit.

#### Scenario: Bot author tagged
- **WHEN** a retained comment's author is a bot account
- **THEN** the snapshot records `isBot: true` for that comment

#### Scenario: Image available offline
- **WHEN** the issue body embeds an image
- **THEN** the image is stored in the bundle and the rendered issue references the bundled copy

### Requirement: Issue prompt variants
Each bundle SHALL contain three rendered issue variants: `body` (title, opening metadata, body), `body+human` (plus retained non-bot comments), and `body+all` (plus all retained comments, bots included, with bot authorship visible as on GitHub). A run SHALL select exactly one variant and render it identically for every candidate.

#### Scenario: Bot comments retained in the full variant
- **WHEN** a retained comment was authored by a bot account
- **THEN** it appears in `body+all`, is absent from `body+human`, and is tagged `isBot` in the snapshot

### Requirement: Sealed base repository
The workspace repository for a task SHALL be rebuilt at the base commit (first parent of the PR's merge commit) containing only history reachable from the base commit, with no remotes, no reflog, and no tags pointing at later commits. Bundle preparation SHALL fail if the merge commit or any commit after the base is present in the object store.

#### Scenario: Future commit absent
- **WHEN** a sealed repository is prepared
- **THEN** looking up the merge commit SHA fails, `git log --all` shows no commit after the base, and `git fsck --lost-found` recovers no later commit

### Requirement: Offline test environment
Each task SHALL have a reproducible environment built from the base commit's lockfile, or, without one, by resolving dependencies no newer than the base commit date. Test execution for validation and grading SHALL run without network access and without live credentials, replaying recorded HTTP fixtures where the repository provides them.

#### Scenario: Live-API test without a recording
- **WHEN** a test needs a live provider API and has no recorded fixture
- **THEN** it fails fast (no retry-until-timeout) and is classified as env-broken rather than as a task signal

### Requirement: FAIL_TO_PASS validation
The validator SHALL run the task's test command once at base plus the test patch and twice with the reference patch added, classifying each test as FAIL_TO_PASS, PASS_TO_PASS, flaky, or env-broken. Only FAIL_TO_PASS and PASS_TO_PASS tests are scored. A task with no FAIL_TO_PASS test, or with a test the reference patch regresses, SHALL be rejected.

#### Scenario: Valid task
- **WHEN** at least one test flips fail→pass consistently and no test regresses under the reference patch
- **THEN** the bundle is accepted with its FAIL_TO_PASS, PASS_TO_PASS, flaky, and env-broken lists recorded

#### Scenario: Flaky test excluded
- **WHEN** a test passes in one gold run and fails in the other
- **THEN** it is recorded as flaky and appears in neither FAIL_TO_PASS nor PASS_TO_PASS

#### Scenario: Env-broken test excluded
- **WHEN** a test fails in both gold runs (e.g. it needs a live API)
- **THEN** it is recorded as env-broken and never scored

#### Scenario: Reference regresses a test
- **WHEN** a test passes before but fails under the reference patch
- **THEN** the task is rejected

### Requirement: Live-API task classification and recovery
A task with no FAIL_TO_PASS test whose env-broken tests fail in gold on blocked or unauthenticated provider calls SHALL be rejected as `needs-live-api`, reported separately as recoverable. Recovery SHALL record the affected tests' provider responses once at mining time, add the recordings to the sealed test patch, and re-validate offline; a test whose before-run fails only on a missing recording SHALL NOT count as FAIL_TO_PASS.

#### Scenario: Live-API task classified
- **WHEN** a task's only fail→pass candidates fail in gold with connection or authentication errors to a provider API
- **THEN** it is rejected as `needs-live-api`, not `no-fail-to-pass`

#### Scenario: Recovered task
- **WHEN** recordings captured at mining time make the tests pass offline under the reference patch and the before-run fails for a reason other than a missing recording
- **THEN** the task is accepted with the recordings sealed in its test patch

#### Scenario: Ambiguous before-failure
- **WHEN** after recording, a test's before-run fails only because a request has no recording
- **THEN** that test is not counted as FAIL_TO_PASS

### Requirement: Solution-leak classification
The miner SHALL label the body and every retained comment against the reference patch as `noise`, `symptom`, `diagnosis`, `fix_sketch`, or `fix_code`, recording verbatim evidence, reference files revealed, consistency with the reference fix, author role, classifier model, and prompt hash. Content inconsistent with the reference SHALL be labeled no higher than `symptom`.

#### Scenario: Reporter pasted the fix
- **WHEN** the issue body contains code substantially equal to the reference fix
- **THEN** the body is labeled `fix_code` and the task remains eligible, stratified as body-leaked

#### Scenario: Wrong bot guess
- **WHEN** a bot comment proposes a cause the reference fix does not address
- **THEN** it is labeled `symptom` with `consistent_with_reference: false`

### Requirement: Leak strata and classifier independence
The body leak level SHALL be recorded as a difficulty stratum and SHALL NOT by itself exclude a task. The classifier model SHALL differ from the worker model of any run that uses its labels.

#### Scenario: Classifier equals worker
- **WHEN** a run's worker model is the model that produced the bundle's leak labels
- **THEN** run validation fails until the labels are regenerated with a different model

### Requirement: Frozen task bundle
Each accepted task SHALL be frozen as a bundle containing a manifest with the SHA-256 of every bundle file, the base commit, T*, issue and PR dates, environment digest, test command, test paths (every directory holding the repository's tests), and test lists. Runs SHALL record bundle hashes in provenance and SHALL fail before dispatch if any hash mismatches. Bundles SHALL NOT be re-fetched from GitHub at run time.

#### Scenario: Tampered bundle
- **WHEN** a bundle file's content no longer matches its recorded hash
- **THEN** the run fails before any trial is dispatched, naming the file

### Requirement: Contamination dating
Each bundle SHALL record the issue creation and PR merge dates, and reports SHALL flag results on tasks dated before the worker model's recorded knowledge cutoff.

#### Scenario: Pre-cutoff task flagged
- **WHEN** a run's worker model has a knowledge cutoff later than a task's PR merge date
- **THEN** the report marks that task's results as possibly contaminated

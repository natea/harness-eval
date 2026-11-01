## ADDED Requirements

### Requirement: Brownfield run view
The results dashboard SHALL render a brownfield run as a per-trial table: task (linking the issue and the merged PR), verdict and reason, harness vs original-PR quality score and preference, patch size and file overlap against the merged PR, agent time and cost beside the human baseline, and review flags.

#### Scenario: Brownfield run opened
- **WHEN** an operator opens a run whose trials are brownfield
- **THEN** the brownfield table is shown instead of the PRD scorecard

### Requirement: Brownfield trial comparison view
A brownfield trial view SHALL show the harness's diff beside the merged PR's diff, the per-criterion quality comparison with the judge's notes, the hidden-test outcomes, and the audit verdict.

#### Scenario: Compared with the merged PR
- **WHEN** an operator opens a brownfield trial
- **THEN** both diffs are shown side by side with both quality scores

### Requirement: Trial transcript view
The trial view SHALL show the archived session transcript, turn by turn, for any trial that has one.

#### Scenario: Transcript available
- **WHEN** a trial has archived transcripts
- **THEN** the trial view shows the conversation

### Requirement: Light and dark theme
The results dashboard SHALL offer a light/dark theme toggle consistent with Studio's, persisted across visits.

#### Scenario: Theme persists
- **WHEN** an operator switches to the light theme and reloads
- **THEN** the dashboard renders in the light theme

### Requirement: Harness activity
Each trial SHALL show whether the framework was actually used: the framework plugins loaded, the framework skills and commands available, framework commands the session ran, framework skills the model invoked, and subagent use, summarised as engaged, not engaged, or no framework. The run view SHALL show this per trial.

#### Scenario: Framework loaded but unused
- **WHEN** a framework's plugin loaded but the model invoked none of its skills and the session ran none of its commands
- **THEN** the trial is marked "not engaged", naming what was available


# Spec Delta: trial-transcript-audit — solution reach

## ADDED Requirements

### Requirement: Solution-reach detection for brownfield trials
The audit SHALL scan each brownfield trial's redacted transcript for evidence of reaching the fixing change. Any hit SHALL mark the trial `disqualified:solution-reach` with the matching transcript line; disqualified trials SHALL be excluded from scoring and listed in the report.

#### Scenario: Detected solution-reach patterns
- **WHEN** a transcript contains the fixing PR's number or URL, the merge or fix SHAs, an upstream pull/commit/compare URL, a GitHub CLI or API call against the upstream, a fetch or clone of the upstream, or an install of the project's own package newer than the base
- **THEN** the trial is disqualified with the matching line as evidence

#### Scenario: Agent looks up the PR
- **WHEN** a transcript contains a tool call fetching the fixing pull request
- **THEN** the trial is disqualified with that line as evidence and excluded from scores

#### Scenario: Issue number mentioned in the provided text
- **WHEN** the transcript only quotes issue numbers that appear in the provided issue file
- **THEN** no disqualification is raised

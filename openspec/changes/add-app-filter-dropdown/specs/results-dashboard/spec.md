# Spec Delta

## ADDED Requirements

### Requirement: App filter on the Dashboard
The Dashboard's leaderboard page SHALL show each run's app in the runs table and SHALL offer a dropdown listing "All" plus every app present, where an app is a greenfield PRD target or a brownfield repository. Selecting an app SHALL limit the runs table and the runs used for the leaderboard scores. "All" SHALL be the default.

#### Scenario: Selecting an app
- **WHEN** an operator selects an app
- **THEN** the runs table and leaderboard scores include only that app's runs

#### Scenario: All apps
- **WHEN** an operator selects "All"
- **THEN** every run is listed, including unsupported runs and runs whose app cannot be identified

#### Scenario: Brownfield repository selected
- **WHEN** the selected app has only brownfield runs, which have no PRD scores
- **THEN** the runs table lists them and the leaderboard states that it has no scores for this app

### Requirement: Dashboard app selection in the URL
The selected app SHALL be held in the page URL, so that a reload or a shared link shows the same selection. An app in the URL that matches no listed run SHALL fall back to "All".

#### Scenario: Reloading a filtered page
- **WHEN** an operator reloads the page with an app selected
- **THEN** the same app remains selected and the listing stays filtered

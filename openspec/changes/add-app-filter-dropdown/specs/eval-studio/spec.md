# Spec Delta

## ADDED Requirements

### Requirement: App filter on Studio run listings
Studio's leaderboard and runs pages SHALL each offer a dropdown listing "All" plus every app present in the listed runs, where an app is a greenfield PRD target or a brownfield repository. Selecting an app SHALL limit that page's listing to that app's runs; on the leaderboard page it SHALL also limit the runs used for the leaderboard scores. "All" SHALL be the default and SHALL list every run.

#### Scenario: Selecting an app
- **WHEN** an operator selects an app on the leaderboard page
- **THEN** the runs table and leaderboard scores include only that app's runs

#### Scenario: All apps
- **WHEN** an operator selects "All"
- **THEN** every listed run is shown, including runs whose app cannot be identified

#### Scenario: Brownfield repository selected
- **WHEN** the selected app has only brownfield runs, which have no PRD scores
- **THEN** the runs table lists them and the leaderboard states that it has no scores for this app, rather than appearing broken

### Requirement: Studio app selection in the URL
The selected app SHALL be held in the page URL, so that a reload or a shared link shows the same selection. An app in the URL that matches no listed run SHALL fall back to "All".

#### Scenario: Reloading a filtered page
- **WHEN** an operator reloads a page with an app selected
- **THEN** the same app remains selected and the listing stays filtered

#### Scenario: Unknown app in the URL
- **WHEN** the URL names an app that no listed run belongs to
- **THEN** the page shows "All" and lists every run

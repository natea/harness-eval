# Spec Delta: eval-studio

## ADDED Requirements

### Requirement: Bracket view
The studio SHALL provide a Bracket view that renders a bakeoff as a single-elimination tree — rounds laid out in order, each matchup showing its two entrants and, once played, the scoreline with the winner highlighted — and SHALL surface the live current match, linking each side to its trial page. The view SHALL show each match's goal scoreline alongside the entrants' weighted adherence, so the scoreline is not mistaken for the rubric score.

#### Scenario: Bracket renders rounds, scorelines, and the live match
- **WHEN** a bracket exists with some matches played and one in progress
- **THEN** the view shows the bracket tree with played scorelines and highlighted winners, shows the in-progress match as live with links to its trials, and displays both the goal scoreline and the weighted adherence for played matches

#### Scenario: Empty or not-yet-started bracket
- **WHEN** a bracket has been seeded but no match has finished
- **THEN** the view shows the seeded matchups and projected match/build counts without implying any result

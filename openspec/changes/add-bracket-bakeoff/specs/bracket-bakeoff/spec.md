# Spec Delta: bracket-bakeoff

## ADDED Requirements

### Requirement: Head-to-head match on a shared frozen PRD
A match SHALL pit two entrants (registry candidates) against the same target, each building under the identical rendered base prompt and graded by the normal pipeline. Both entrants in a match SHALL use the same frozen PRD and test plan, so the two scorelines are directly comparable.

#### Scenario: Two entrants play one match fairly
- **WHEN** a match is run between two entrants on a target
- **THEN** each entrant builds the same frozen PRD with the identical base prompt and is graded independently, and the match records both trials' references alongside the computed scoreline

#### Scenario: Mismatched PRD is rejected
- **WHEN** the two sides of a match would be graded against different frozen PRDs or test plans
- **THEN** the match is not scored and an error is recorded, because the scorelines would not be comparable

### Requirement: Goal scoring from step outcomes
A match score per entrant SHALL be the sum, over non-bonus PRD steps, of +1 for a passed step, −1 for a failed step, and the step's partial credit (between 0 and 1) for a partial step, derived read-only from the graded step results. The entrant with the higher score SHALL win. This score SHALL NOT alter the adherence score or the weighted composite.

#### Scenario: Goals computed from passes, fails, and partials
- **WHEN** an entrant's graded trial has passing, failing, and partial steps
- **THEN** its match score is the sum of +1 per pass, −1 per fail, and the partial credit per partial over non-bonus steps, and the adherence/composite scores are unchanged

#### Scenario: Higher score advances
- **WHEN** two entrants finish a match with different scores
- **THEN** the higher-scoring entrant is recorded as the winner and advances

### Requirement: Deterministic tie resolution
When two entrants finish a match with equal scores, the winner SHALL be decided by a fixed, reproducible chain — higher absolute code quality, then higher efficiency (fewer worker tokens, then faster), then better seed — with no randomness, and the deciding criterion SHALL be recorded.

#### Scenario: A tie is broken reproducibly and recorded
- **WHEN** a match ends with equal scores
- **THEN** the winner is chosen by the first decisive criterion in the chain, the same result is produced on every replay, and the deciding criterion is recorded on the match

### Requirement: Single-elimination bracket with reproducible seeding
The system SHALL arrange entrants into a single-elimination bracket from a recorded seed, granting top seeds byes when the field is not a power of two, advance each match winner to the next round, and persist the bracket structure and per-match results durably so progress survives a restart.

#### Scenario: Winner advances and the bracket persists
- **WHEN** a match completes within a bracket
- **THEN** the winner is advanced to its next-round slot, the bracket state is written durably, and reloading the bracket shows the recorded scoreline and the advanced entrant

#### Scenario: Non-power-of-two field gets byes
- **WHEN** a bracket is seeded with a number of entrants that is not a power of two
- **THEN** the top seeds receive first-round byes so the bracket is well-formed, determined solely by the recorded seed

### Requirement: Baseline-gauntlet first round
When a field contains the no-framework baseline (e.g. `bare`/`codex-baseline`) and at least one framework, the first round SHALL be a gauntlet in which every framework plays a match against the baseline rather than seeding the baseline as an ordinary entrant. A framework that beats the baseline SHALL advance; a framework that loses to (or ties and is beaten by) the baseline SHALL be eliminated and that loss SHALL be recorded as an upset. The frameworks that beat the baseline SHALL then play a seeded single-elimination bracket among themselves to a champion. When the field has no baseline (or no non-baseline framework), the system SHALL fall back to an ordinary seeded single-elimination over the whole field.

#### Scenario: Framework beats the baseline and advances
- **WHEN** a framework's match against the baseline is decided in the framework's favour
- **THEN** the framework advances into the winners' bracket and the baseline does not occupy a winners'-bracket slot for that match

#### Scenario: Losing to the baseline is an upset
- **WHEN** a framework's first-round match against the baseline is decided in the baseline's favour
- **THEN** the framework is eliminated, the result is recorded as an upset (baseline as winner), and the framework does not advance

#### Scenario: No baseline in the field
- **WHEN** a bracketable field contains no no-framework baseline
- **THEN** the system seeds an ordinary single-elimination bracket over the whole field (no gauntlet round)

### Requirement: Bounded, transparent spend
Before a bracket starts, the system SHALL surface the projected number of matches (entrants − 1) and builds (two per match) and SHALL NOT silently launch them; a bracket SHALL be bound to a single frozen PRD.

#### Scenario: Projected spend is shown before launch
- **WHEN** a bracket is configured with a field of entrants on one target
- **THEN** the projected match and build counts are presented before any build is launched, and the bracket runs against that single frozen PRD

### Requirement: Per-step goal-event stream
A live match SHALL expose a per-step goal-event stream — a passed step as a goal, a failed step as a miss, a partial step with its credit — riding the existing per-step evaluator events, so a later animated match-cast can subscribe without changing the grading.

#### Scenario: Live match emits goal events per step
- **WHEN** a match is being graded and a PRD step resolves to pass, fail, or partial
- **THEN** a corresponding goal / miss / partial event is emitted on the match's event stream, carrying the step id and the running scoreline

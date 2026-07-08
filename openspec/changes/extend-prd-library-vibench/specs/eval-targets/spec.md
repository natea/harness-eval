# Spec Delta: eval-targets — more ViBench-derived targets

## ADDED Requirements

### Requirement: ViBench-derived targets extend the library with preserved provenance
The target library SHALL be extendable with additional targets adapted from the ViBench public PRD set, each recording its provenance (upstream `vibench-public`, repo, the pinned commit, `originalDir`, `license: Apache-2.0`, and an adaptation note) in `target.yaml`, attributed in `targets/NOTICE`, and frozen by PRD and test-plan content hashes — the same obligations as existing adapted targets. A ViBench PRD that is already adapted SHALL NOT be duplicated.

#### Scenario: A new ViBench target is added with full provenance
- **WHEN** a previously-unused ViBench PRD is adapted into a new target
- **THEN** its `target.yaml` carries the `source:` block (upstream, repo, pinned commit, `originalDir`, Apache-2.0, adaptation note), it is attributed in `targets/NOTICE`, and its PRD and test-plan hashes are frozen

#### Scenario: Already-adapted PRDs are not duplicated
- **WHEN** the batch is selected
- **THEN** PRDs already adapted (barber, collabrative_kaban, logistics, market_place, notes, pilot_logbook) are excluded

### Requirement: Browser-driven PRDs are adapted behavior-preservingly
A browser/UI-driven ViBench PRD SHALL be adapted to a cold-gradable target (HTTP/JSON API, plus a served page where the domain implies a UI), with DOM/interaction grading dropped but every REQUIRED behavior expressed as a cold test-plan step, and the `source.note` SHALL state what grading was dropped.

#### Scenario: Required behaviors remain cold-gradable
- **WHEN** a browser-driven ViBench PRD is adapted
- **THEN** every REQUIRED behavior is gradable cold by the test-plan harness, and the adaptation note records the dropped DOM/interaction grading

#### Scenario: New targets validate
- **WHEN** `validate` runs over the extended library
- **THEN** each new target passes schema, freeze binding, and coverage-mode obligations with its NOTICE attribution present

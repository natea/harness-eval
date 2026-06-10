# Capability: eval-targets

## ADDED Requirements

### Requirement: Target definition and manifest
An eval target SHALL be a self-contained directory under `targets/<name>/` containing a manifest (`target.yaml`), the PRD document, a frozen weighted test plan, and any evaluation fixtures. The manifest SHALL declare: name, version, PRD file and its SHA-256, test-plan file, conformance-section pointer, cold-start contract, fixture process definitions, and coverage mode (`spec-checklist` or `attested`).

#### Scenario: Manifest validation
- **WHEN** a target is loaded for a run
- **THEN** the manifest validates against the schema, the PRD's recorded hash matches the file, and a mismatch fails the run before any trial is dispatched

### Requirement: Shipped target library
The harness SHALL ship targets covering distinct software shapes, at minimum: `symphony-daemon` (the existing Symphony spec, test plan, and fixtures migrated content-identical), `web-app`, `cli-tool`, and `rest-api`, each with a spec-derived weighted test plan and fixtures sufficient for evidence-based evaluation.

#### Scenario: Symphony migration preserves comparability
- **WHEN** the `symphony-daemon` target is selected after migration
- **THEN** its PRD and test-plan content hashes equal the pre-migration hashes, so prior run results remain comparable

### Requirement: Custom targets
The CLI SHALL scaffold a new target from a user-provided spec document (`target init <name> --spec <file>`) and SHALL validate any target (`target validate <name>`) for schema, hash freshness, weight sanity, and coverage-mode obligations. Custom targets SHALL be subject to the same freeze and provenance rules as shipped targets.

#### Scenario: Bring-your-own PRD
- **WHEN** a user scaffolds a target from their own spec, authors its test plan, and the target passes validation
- **THEN** a run with `--target <name>` executes end-to-end (build, grade, report) with the target's name, version, and hashes recorded in provenance

#### Scenario: Unattested coverage blocks the run
- **WHEN** a target in `attested` coverage mode lacks a coverage attestation
- **THEN** target validation fails and the run does not start

### Requirement: Target-scoped scoring boundaries
Results SHALL record the target per run, and reporting SHALL NOT aggregate or rank scores across different targets.

#### Scenario: Cross-target aggregation refused
- **WHEN** a report or leaderboard query spans runs with different targets
- **THEN** candidates are grouped per target with no combined ranking across targets

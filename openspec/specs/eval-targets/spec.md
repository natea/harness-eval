# eval-targets Specification

## Purpose
TBD - created by archiving change add-prd-library. Update Purpose after archive.
## Requirements
### Requirement: Target definition and manifest
An eval target SHALL be a self-contained directory under `targets/<name>/` containing a manifest (`target.yaml`), the PRD document, a frozen weighted test plan, and any evaluation fixtures. The manifest SHALL declare: name, version, PRD file and its SHA-256, test-plan file, conformance-section pointer, cold-start contract, fixture process definitions, and coverage mode (`spec-checklist` or `attested`). The manifest SHALL additionally declare catalog metadata describing what the target builds: a one-line `summary`, a longer `description` of the deliverable and what is graded, and `tags` carrying at least the `domain`, the software `shape`, and an `expectedUI` indicator stating how much rendered UI a conformant build will actually have (e.g. `none`, `served-page`, `interactive`). Catalog metadata is descriptive only and SHALL NOT be injected into the rendered base prompt.

#### Scenario: Manifest validation
- **WHEN** a target is loaded for a run
- **THEN** the manifest validates against the schema, the PRD's recorded hash matches the file, and a mismatch fails the run before any trial is dispatched

#### Scenario: Catalog metadata required
- **WHEN** a target manifest omits `summary`, `description`, or the required `tags` (`domain`, `shape`, `expectedUI`)
- **THEN** target validation fails with a message naming the missing field

#### Scenario: Catalog metadata excluded from the prompt
- **WHEN** the base prompt is rendered for any candidate
- **THEN** the rendered text contains no `summary`, `description`, or `tags` content, preserving the identical-prompt fairness invariant

### Requirement: Upstream attribution for adapted targets
A target adapted from a third-party source SHALL record provenance in its manifest under a `source` block declaring at least the upstream name, repository URL, commit SHA, original directory, and license identifier. The harness SHALL preserve required upstream notices (e.g. a `targets/NOTICE` file for Apache-2.0 sources). When `source.upstream` is present, target validation SHALL require all `source` fields to be complete.

#### Scenario: Adapted target missing provenance fails validation
- **WHEN** a target declares a `source.upstream` but omits a required provenance field (repo, commit, original directory, or license)
- **THEN** target validation fails and the run does not start

### Requirement: Shipped target library
The harness SHALL ship targets covering distinct software shapes, at minimum: `symphony-daemon` (the existing Symphony spec, test plan, and fixtures migrated content-identical), `web-app`, `cli-tool`, and `rest-api`, each with a spec-derived weighted test plan and fixtures sufficient for evidence-based evaluation. The shipped library SHALL additionally include a curated subset of at least four targets adapted from the ViBench catalog spanning software shapes distinct from one another and from the original four (for example: a notes/CRUD store, a stateful quiz/scoring engine, an ordered-collection board, a multi-actor marketplace, a validation-and-aggregation logbook, or a structured-document builder). Each adapted target SHALL be HTTP-light (graded over HTTP/JSON without browser automation), SHALL carry a re-authored HTTP-observable weighted test plan, a coverage attestation, and a frozen PRD hash, and SHALL carry upstream attribution per the attribution requirement.

#### Scenario: Symphony migration preserves comparability
- **WHEN** the `symphony-daemon` target is selected after migration
- **THEN** its PRD and test-plan content hashes equal the pre-migration hashes, so prior run results remain comparable

#### Scenario: Adapted catalog targets validate and run
- **WHEN** each adapted ViBench target is loaded
- **THEN** its manifest validates (schema, hash freshness, coverage attestation, complete `source` provenance), and a run with `--target <name>` executes end-to-end over HTTP/JSON with no browser automation

### Requirement: Custom targets
The CLI SHALL scaffold a new target from a user-provided spec document (`init --target <name> --spec <file>`) and SHALL validate any target (`validate --target <name>`) for schema, hash freshness, weight sanity, and coverage-mode obligations. Custom targets SHALL be subject to the same freeze and provenance rules as shipped targets.

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

### Requirement: Manifest-derived catalog document
The harness SHALL provide a catalog document (`docs/TARGETS.md`) generated from the target manifests rather than hand-authored, listing each target's name, `summary`, `description`, `shape`, `expectedUI`, and provenance. A verification path SHALL detect when the committed catalog document is stale relative to the manifests and SHALL fail rather than silently serve a drifted catalog.

#### Scenario: Catalog generated from manifests
- **WHEN** the catalog generator runs
- **THEN** `docs/TARGETS.md` contains one entry per shipped target sourced from that target's manifest fields

#### Scenario: Stale catalog detected
- **WHEN** a manifest's catalog metadata changes but `docs/TARGETS.md` is not regenerated
- **THEN** the catalog check fails, reporting that the document is out of date


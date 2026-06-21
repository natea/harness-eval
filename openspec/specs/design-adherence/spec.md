# design-adherence Specification

## Purpose
TBD - created by archiving change add-design-adherence. Update Purpose after archive.
## Requirements
### Requirement: Design catalog with provenance
The harness SHALL provide a catalog of design systems as frozen `DESIGN.md`
token specs under `designs/<name>/`. A vendored spec adapted from a third-party
source SHALL record a `source` provenance block (upstream, repo, commit,
original directory, license) and the harness SHALL preserve the upstream notice
(a `designs/NOTICE` for the MIT-licensed `awesome-design-md` catalog). Each spec
SHALL be content-hashed; drift SHALL fail the run.

#### Scenario: Vendored design carries attribution
- **WHEN** a design adapted from `awesome-design-md` is loaded
- **THEN** its `source` block is complete and `designs/NOTICE` exists, or loading fails

#### Scenario: Design spec drift fails loudly
- **WHEN** a selected `DESIGN.md`'s content no longer matches its recorded hash
- **THEN** the run fails before any trial is dispatched

### Requirement: Design selection injects an identical instruction
A run MAY select a design with `--design <name>`. When set, the harness SHALL
render an identical design instruction into the single shared base prompt every
candidate receives, referencing the in-workspace `DESIGN.md` and its token
contract. Candidate prompts SHALL remain identical within the run.

#### Scenario: Same design instruction for every candidate
- **WHEN** a run selects `--design linear` across multiple candidates
- **THEN** each candidate's rendered base prompt contains the same design instruction and the same `DESIGN.md`

#### Scenario: Non-UI target no-ops with a warning
- **WHEN** `--design` is set for a target that produces no user interface
- **THEN** the run records a warning that design adherence is not applicable rather than failing

### Requirement: Design-adherence scoring
When a design is selected, the harness SHALL score how closely the built
implementation's realized tokens match the chosen `DESIGN.md`, producing a 0–100
`designAdherence` dimension with per-category detail (color, typography, and
where present spacing/radius). The v1 scorer SHALL operate statically (no
browser) by extracting realized tokens from the implementation's CSS custom
properties, theme/Tailwind config, and inline/utility styles, and SHALL record
the matched and missed tokens as evidence.

#### Scenario: Declared-token match scored with evidence
- **WHEN** an implementation declares a theme and the evaluator compares it to the design's palette and type scale
- **THEN** a 0–100 adherence score with per-category breakdown is recorded, citing which spec tokens were matched and which were missing

#### Scenario: Off-spec implementation scores low, not fatal
- **WHEN** an implementation ignores the design and ships generic defaults
- **THEN** it receives a low design-adherence score and the run still completes (adherence is a graded signal, never a fatal gate)

### Requirement: Design recorded and rankable within a run
The harness SHALL record the chosen design (name + provenance, unaltered) and
the `designAdherence` score in provenance, results, and the scorecard. Because a
run fixes one (PRD, design) pair, results SHALL permit ranking candidates by
design adherence within that run, and including design adherence in the weighted
composite SHALL be opt-in.

#### Scenario: Design adherence reported as its own dimension
- **WHEN** a run with `--design` completes and is reported
- **THEN** the scorecard shows the chosen design and a per-candidate design-adherence score, and the composite includes it only if a design weight was set

#### Scenario: Cross-framework design ranking
- **WHEN** multiple candidates build the same PRD against the same design in one run
- **THEN** the report can rank them by design adherence, labeled valid only for that design


# input-spec-viewer Specification

## Purpose
TBD - created by archiving change add-input-spec-viewer. Update Purpose after archive.
## Requirements
### Requirement: Serve a run's input spec by its frozen hash
The system SHALL resolve a run to the target it built by matching the run's recorded PRD content hash against the current targets, and SHALL serve that target's PRD document text and test-plan text read-only. Serving the input spec SHALL NOT create, modify, or delete any file.

#### Scenario: Input spec served for a current-target run
- **WHEN** the input spec is requested for a run whose recorded PRD hash matches a current target
- **THEN** the response returns that target's PRD text and test-plan text, marked as matching the run's frozen hash, and nothing on disk is modified

#### Scenario: Missing run
- **WHEN** the input spec is requested for a run id that does not exist
- **THEN** the request returns not-found

### Requirement: Honest handling of a re-frozen PRD
When a run's recorded PRD hash matches no current target — because the PRD was re-frozen after the run — the system SHALL report that the run's frozen spec is not available rather than serving the current target's PRD as if it were the run's.

#### Scenario: Re-frozen PRD is flagged, not faked
- **WHEN** the input spec is requested for a run whose recorded PRD hash matches no current target
- **THEN** the response indicates the run's frozen spec does not match any current target and does not present a substitute document as the run's spec


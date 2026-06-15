# Spec Delta: eval-studio — Artifact Audit + Demo

## ADDED Requirements

### Requirement: Trial artifact audit panel
The studio's trial drill-down SHALL present a read-only artifact audit for the trial: the built file tree, the target's cold-start contract, captured preview/cold-start logs when present, and the recorded grades summary. The panel SHALL read only and SHALL never create, modify, or delete archived artifacts.

#### Scenario: Audit a trial's artifacts
- **WHEN** a reviewer opens a completed trial's drill-down
- **THEN** the artifact audit panel lists the built files, the cold-start contract, and the grades summary without mutating the archive

### Requirement: Trial demo control
The studio trial drill-down SHALL provide a demo control that starts and stops an isolated preview of the trial's built artifact and, once the preview is ready, links the live demo URL. While the preview is starting, the control SHALL show a readiness indicator; if the cold-start fails, it SHALL surface the captured logs. The control SHALL bind to localhost and SHALL run previews through the artifact-preview capability (sandbox-isolated by default), never executing the artifact through an unscoped studio endpoint.

#### Scenario: Start and open a demo
- **WHEN** the reviewer clicks the demo control for a web target trial
- **THEN** the studio starts an isolated preview, shows a readiness indicator, and links the live demo URL when ready

#### Scenario: Stop a demo
- **WHEN** the reviewer stops a running demo
- **THEN** the preview is torn down (sandbox/process destroyed and route released) and the link is removed

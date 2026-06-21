# Spec Delta: artifact-preview

## ADDED Requirements

### Requirement: Read-only artifact audit
The system SHALL provide a read-only inventory of a completed trial's archived artifacts — the built file tree (paths and sizes, excluding vendored directories such as `node_modules`, `.git`, and `dist`), the target's cold-start contract, the presence of the scrubbed blind copy, the recorded grades summary, and any captured preview logs. Producing the inventory SHALL NOT create, modify, or delete any file under the trial's archived directory.

#### Scenario: Inventory a trial without mutation
- **WHEN** the audit inventory is requested for a completed trial
- **THEN** it returns the file tree, cold-start contract, blind-copy presence, and grades summary, and the trial's archived directory is byte-for-byte unchanged

#### Scenario: Vendored directories excluded
- **WHEN** the inventory walks a workspace containing `node_modules`
- **THEN** vendored directories are omitted from the file tree

### Requirement: Isolated live demo of a built artifact
The system SHALL boot a completed trial's archived deliverable on demand via the target's cold-start contract and expose a reachable demo URL, running from a COPY of the archived workspace and never mutating the archive. Execution SHALL be isolated in a sandbox provider by default; running the artifact directly on the host SHALL require an explicit opt-in and SHALL record the chosen provider and trust posture with the preview. The demo SHALL be reported `ready` only after the artifact passes a cold-start health check within the target's cold-start budget; otherwise it SHALL be `failed` with the captured setup/start logs available.

#### Scenario: Demo a web artifact in isolation
- **WHEN** a reviewer requests a demo of a completed web target trial
- **THEN** the system copies the archived workspace, runs the cold-start contract in the default sandbox provider, health-checks it, and returns a reachable demo URL, leaving the archived workspace unmodified

#### Scenario: Host execution requires explicit opt-in
- **WHEN** a demo is requested with host (non-sandboxed) execution
- **THEN** it proceeds only when the explicit host opt-in is given, and the preview records that it ran on the host with that trust acknowledgement

#### Scenario: Failed cold-start surfaces logs
- **WHEN** the artifact does not become healthy within the cold-start budget
- **THEN** the preview is reported `failed` and the captured `setup.sh`/`start.sh` logs are available for audit

### Requirement: Pluggable preview routing
The system SHALL resolve a demo URL through a configurable router. A default port router SHALL allocate a free ephemeral port and return a `localhost` URL with no external dependency. An optional portless router SHALL register the backend under a stable per-trial name with the portless proxy and return a stable `*.localhost` URL; when the portless proxy is unavailable, the system SHALL fall back to the port router and record that it did so rather than failing the demo.

#### Scenario: Default port routing
- **WHEN** the preview router is the default and a demo starts
- **THEN** the demo URL is a `localhost` address on an allocated free port

#### Scenario: Portless routing with fallback
- **WHEN** the portless router is selected but the portless proxy is not available
- **THEN** the demo still starts via the port router and the fallback is recorded

### Requirement: Preview lifecycle and limits
The system SHALL track each preview through a lifecycle (starting, ready or failed, stopped) and SHALL bound resource use: previews start on demand only, stop on explicit request and after an idle timeout, are limited by a maximum concurrency, and bind to localhost. Stopping, idling out, or crashing SHALL tear down the underlying sandbox or process AND release the router route, so no preview leaks a running process, container, or route. When a start is refused because the concurrency cap is reached, the refusal SHALL be reported, not silently dropped.

#### Scenario: Idle preview is reclaimed
- **WHEN** a ready preview receives no traffic for the idle timeout
- **THEN** it is stopped, its sandbox/process is destroyed, and its router route is released

#### Scenario: Concurrency cap is enforced and visible
- **WHEN** a demo start would exceed the maximum concurrent previews
- **THEN** the start is refused with a reported reason rather than silently dropped

### Requirement: Non-web targets degrade gracefully
For targets without an HTTP deliverable (e.g. CLI or daemon targets), the system SHALL NOT fabricate a web URL; instead the demo SHALL be a captured cold-start run — running the cold-start contract and a declared sample invocation and capturing its output and exit status. The read-only artifact audit SHALL remain available for every trial regardless of target kind.

#### Scenario: CLI target demo is a captured run
- **WHEN** a demo is requested for a CLI target trial
- **THEN** the system runs the cold-start contract and the sample invocation, captures stdout and exit status, and presents that instead of a web URL, while the artifact audit remains available

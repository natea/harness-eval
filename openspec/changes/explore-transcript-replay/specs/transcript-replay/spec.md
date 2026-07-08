# Spec Delta: transcript-replay

## ADDED Requirements

### Requirement: Shareable trial replay export
The system SHALL be able to produce a self-contained, dependency-free HTML replay of a completed trial's build from that trial's archived session transcripts, and surface it from the studio trial drill-down. The export SHALL consume only the redaction-scrubbed archive (not raw session data) and SHALL NOT modify the archived trial artifacts.

#### Scenario: Export a completed trial's replay
- **WHEN** a replay export is requested for a completed trial
- **THEN** the system produces a single self-contained HTML replay from the trial's archived (redacted) session transcripts, linkable from the trial drill-down, leaving the archived artifacts unchanged

### Requirement: Replays never expose secrets
Any transcript replay — post-hoc export or real-time — SHALL operate only on redaction-scrubbed transcript data. A real-time replay SHALL apply secret redaction (at least as strict as the archive-time pass) streaming, before any transcript bytes leave the trial boundary or are served; un-redacted transcript content SHALL never be rendered or served.

#### Scenario: Post-hoc export inherits the archive redaction
- **WHEN** a replay is exported from a trial's archived transcripts
- **THEN** it contains no secrets, because the archive it reads is already redacted

#### Scenario: Real-time replay redacts before egress
- **WHEN** a transcript is streamed live from a sandbox for real-time replay
- **THEN** secret redaction is applied to the stream before it is mirrored or served, so the injected worker auth token and any agent-echoed secrets never reach a viewer

### Requirement: Real-time build replay across concurrent sandboxes (explored)
The system SHOULD be able to replay trials in real time as they build, including multiple trials running concurrently in different sandboxes, presented as separate live replays or a combined view. This capability is gated on the redaction requirement above: it SHALL NOT serve any live transcript until streaming redaction is proven, and SHALL degrade to post-hoc export when live egress is unavailable for a provider.

#### Scenario: Watch concurrent builds live
- **WHEN** multiple trials are building concurrently in separate sandboxes and streaming redaction is in place
- **THEN** each trial's redacted transcript is mirrored and replayed live, viewable per trial or as a combined build view

#### Scenario: Fall back when live egress is unavailable
- **WHEN** a provider cannot stream a trial's transcript live (or streaming redaction is not yet proven)
- **THEN** the system does not serve live transcript bytes and the trial's replay is available post-hoc from its redacted archive instead

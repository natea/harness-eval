## ADDED Requirements

### Requirement: Compression-tool selection in Configure
The Configure view SHALL expose registered compression tools as a selectable axis,
showing each tool's `kind` and `applyPoint`. When a `worker`-apply-point tool is
selected, the studio SHALL surface that it is a recorded harness/framework+compression
intervention (a confound caveat), not a pure comparison; selecting none leaves the
run uncompressed.

#### Scenario: Pick a compression tool when configuring a run
- **WHEN** the operator opens Configure
- **THEN** the registered compression tools (headroom, ponytail, caveman) are
  selectable with their kind/apply-point shown, and choosing a worker-apply-point
  tool shows the confound caveat

#### Scenario: Default is no compression
- **WHEN** the operator configures a run without selecting a compression tool
- **THEN** the worker build runs uncompressed and its token-spend reflects that

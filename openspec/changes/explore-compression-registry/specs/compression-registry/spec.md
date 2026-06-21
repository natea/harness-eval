# Capability: compression-registry

## ADDED Requirements

### Requirement: Pluggable compression-tool registry
The harness SHALL define token-compression tools in a versioned registry, each
declaring at least: id, `kind` (`proxy` | `agent-instruction`), `applyPoint`
(`grading-path` | `worker`), install/invocation, and selection metadata (summary +
savings claim). Adding a tool SHALL be a registry entry, not an engine change.
headroom, ponytail, and caveman SHALL be the initial entries.

#### Scenario: Registered tools load and are selectable
- **WHEN** the registry is loaded
- **THEN** it lists headroom (proxy / grading-path-capable), ponytail
  (agent-instruction / worker), and caveman (agent-instruction / worker), each with
  its kind, apply-point, and selection metadata

### Requirement: Apply-point fairness boundary
A tool with `applyPoint: grading-path` SHALL only affect the eval's own
evaluator/judge calls (operational spend), never the measured artifact. A tool with
`applyPoint: worker` changes the build and its token-spend and SHALL be treated as an
explicit, recorded intervention (harness/framework + compression) — never applied
silently by default — with provenance and the scorecard recording it as a confound.

#### Scenario: Worker compression is a flagged intervention
- **WHEN** a run applies a `worker` compression tool to a candidate
- **THEN** provenance and the scorecard record a harness/framework+compression
  comparison (a confound caveat), not a pure comparison, and an un-selected run is
  uncompressed

#### Scenario: Grading-path compression leaves results unchanged
- **WHEN** a `grading-path` tool compresses the judge/evaluator calls
- **THEN** the measured token-spend of the worker build is unchanged and graded
  verdicts/scores match (within noise) an uncompressed grading run

### Requirement: Measured fidelity and go/no-go per tool
The exploration SHALL, for each tool, measure its token/cost savings on
representative trials and confirm fidelity (a worker tool's build still passes
grading; a grading-path tool's verdicts are unchanged), concluding with a go/no-go
per tool naming where it is safe to apply.

#### Scenario: Evidence-backed per-tool recommendation
- **WHEN** the exploration completes
- **THEN** each of headroom, ponytail, caveman has measured savings, a fidelity
  result, and an adopt / do-not-adopt recommendation with its safe apply-point

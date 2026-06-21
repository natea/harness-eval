# Capability: headroom-compression

## ADDED Requirements

### Requirement: Compression boundary excludes the graded build
The eval SHALL NOT compress the worker build's context by default: the worker's
token usage is a graded dimension and its workspace is the measured artifact, so
silently compressing it would distort results. Token compression via headroom SHALL
apply only to eval-operational LLM calls (the evaluator/judge grading path). Any use
of compression on a worker build SHALL be explicit and recorded as a
harness+compression intervention, never a pure-harness comparison.

#### Scenario: Worker build is not compressed by default
- **WHEN** a normal run executes a candidate's build
- **THEN** the worker session runs without headroom compression and its token-spend
  metric reflects the uncompressed build

#### Scenario: Worker compression, if used, is flagged
- **WHEN** a run opts a worker into headroom compression
- **THEN** provenance and the scorecard record it as a harness+compression
  comparison (a confound caveat), not a pure-harness result

### Requirement: Grading-path fidelity gate
Compressing the grading path SHALL preserve graded outcomes: re-grading a fixed set
of archived trials with compression enabled SHALL produce the same pass/fail
verdicts and scores within measurement noise as grading without it. If fidelity does
not hold, the exploration SHALL recommend against adopting headroom on the grading
path.

#### Scenario: Graded outcomes unchanged with compression on
- **WHEN** a fixed set of archived trials is re-graded with and without headroom on
  the judge/evaluator calls
- **THEN** the verdicts and scores match within noise, or the exploration records a
  fidelity failure and a no-go

### Requirement: Measured savings and go/no-go recommendation
The exploration SHALL quantify the token/cost reduction on the grading path on
representative trials and SHALL conclude with a go/no-go recommendation that pairs
the measured savings with the fidelity result.

#### Scenario: Recommendation is evidence-backed
- **WHEN** the exploration completes
- **THEN** it reports measured grading-path token/cost savings alongside the fidelity
  verdict and a clear adopt / do-not-adopt recommendation

### Requirement: Secrets stay within the eval trust boundary
Any headroom proxy/component SHALL run locally within the eval's trust boundary and
SHALL NOT expose worker or grading credentials: secret patterns SHALL be redacted or
kept local exactly as the archiver requires, and the proxy SHALL be localhost-bound.

#### Scenario: No credential leaves the host via the compressor
- **WHEN** grading traffic is routed through the headroom proxy
- **THEN** the proxy is localhost-bound and no credential is sent to any external
  service it does not already authenticate to

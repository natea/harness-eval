# Delta: candidate-registry — zerocode harness and bare candidate

## MODIFIED Requirements

### Requirement: Harness-scoped install and invocation
Candidate entries SHALL scope install steps and session scripts per harness identifier (`claude-code`, `zerocode`; `opencode`, `codex` later), so adding a new harness requires only adding a new harness section per candidate, with no change to orchestration or grading. The registry SHALL include a `bare` candidate — no framework installation, the shared base prompt as its only session step — valid for any harness, serving as the controlled baseline for harness-vs-harness comparison.

#### Scenario: Unknown harness requested
- **WHEN** a run requests harness `opencode` and a candidate entry has no `opencode` section
- **THEN** the run fails validation at load time, naming the candidate and missing harness section

#### Scenario: Bare baseline on two harnesses
- **WHEN** runs execute candidate `bare` on harness `claude-code` and harness `zerocode` with the same model profile and target
- **THEN** both produce comparable result keys differing only in harness, with no framework installation in either trial

#### Scenario: Framework without zerocode support
- **WHEN** a run requests candidate `superpowers` on harness `zerocode`
- **THEN** validation fails at load time (no zerocode section), rather than attempting a Claude Code plugin install in a foreign harness

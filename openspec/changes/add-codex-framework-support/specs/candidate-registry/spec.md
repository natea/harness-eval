## MODIFIED Requirements

### Requirement: Harness-scoped install and invocation
Candidate entries SHALL scope install steps and session scripts per harness identifier, so adding a new harness requires only adding a new harness section per candidate, with no change to orchestration or grading. Both `claude-code` and `codex` are realized harness ids: the GSD, Superpowers, and Agent Skills candidates SHALL each ship a `codex` harness section using that framework's Codex-native, non-interactive install and its Codex invocation form (skill discovery / skill mentions, not Claude slash commands). A candidate MAY omit a `codex` section when the framework has no headless Codex install (e.g. Compound Engineering, whose Codex install requires an interactive TUI step); requesting a harness a candidate lacks fails validation at load time.

#### Scenario: Unknown harness requested
- **WHEN** a run requests harness `opencode` and a candidate entry has no `opencode` section
- **THEN** the run fails validation at load time, naming the candidate and missing harness section

#### Scenario: Framework held fixed across harnesses
- **WHEN** a candidate with both `claude-code` and `codex` sections is run once per harness on the same target and worker-model
- **THEN** each run installs and drives that framework under the requested harness, and provenance records the framework fixed with the harness varied

#### Scenario: Codex-capable candidates ship a codex section
- **WHEN** the shipped registry is loaded
- **THEN** the `gsd`, `superpowers`, and `agent-skills` candidates each have a `codex` harness section, and a run with `--harness codex` for any of them validates and dispatches

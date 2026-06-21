# Tasks: Explore a pluggable compression-tool registry

> Investigation + thin spike + go/no-go per tool. No default adoption.

## 1. Registry
- [ ] 1.1 Define `config/compression.yaml` + a loader: id, `kind`
  (proxy | agent-instruction), `applyPoint` (grading-path | worker),
  install/invocation, selection metadata. Register headroom, ponytail, caveman.
- [ ] 1.2 Encode the fairness boundary: grading-path = operational (safe); worker =
  recorded intervention (provenance + scorecard caveat), never a default.

## 2. Configure selection
- [ ] 2.1 Studio Configure: a selectable compression-tool axis showing each tool's
  kind/apply-point; worker tools show the confound caveat; default = none.

## 3. Explore ponytail + caveman (worker, agent-instruction)
- [ ] 3.1 Wire ponytail (skill / AGENTS.md ruleset injection) into a trial session;
  measure token/cost + LOC delta; confirm the build still passes grading.
- [ ] 3.2 Wire caveman (terseness skill) into a trial session; measure output-token
  delta; confirm grading verdicts unchanged.

## 4. headroom on the grading path (proxy)
- [ ] 4.1 Reuse the headroom-compression spike (grading-path proxy) as the registry's
  proxy/grading-path entry; measure grading savings behind the fidelity gate.

## 5. Recommend
- [ ] 5.1 Go/no-go per tool (headroom / ponytail / caveman) with measured savings,
  fidelity result, and the safe apply-point for each.
- [ ] 5.2 Decide whether to fold in / archive `explore-headroom-compression`.
- [ ] 5.3 `openspec validate explore-compression-registry --strict`.

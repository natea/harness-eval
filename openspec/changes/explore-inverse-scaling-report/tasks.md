# Tasks: Explore Inverse-Scaling Report

## 1. Define the quantities

- [ ] 1.1 Pin the definitions: marginalGain(F,M,T) = adherence(F,M,T) −
  adherence(baseline,M,T); baseline strength = adherence(baseline,M,T), using the
  **absolute** `prdAdherence` (and `codeQuality` as a secondary y)
- [ ] 1.2 Hard-gate the report to absolute dimensions: assert it never reads the
  composite or the run-normalized `speed`/`tokenSpend` (src/grading/scoring.ts)
- [ ] 1.3 Baseline selection: `bare` for claude-code/zerocode, `codex-baseline` for
  codex; omit (with a logged reason) any (M,T) cell lacking a like-for-like baseline

## 2. Assemble the matrix from existing data

- [ ] 2.1 Build a derived aggregator over `runs/*/results.json` that joins cells by
  (target, model, harness), reusing the same-PRD-hash comparability rule from
  scripts/combined-report.ts; tag cross-run-assembled cells with provenance
- [ ] 2.2 Report coverage: how many (framework, model, target) cells have both a
  framework and a baseline; flag thin cells `inconclusive` with per-cell stddev

## 3. The report + view

- [ ] 3.1 Markdown/CLI report: target × framework × model table (baseline,
  with-framework, marginal gain ±σ, n) + a per-target slope readout
- [ ] 3.2 Studio view: the scatter (x = baseline strength, y = marginal gain,
  faceted per target, colored by model) with a trend line, mirroring HarnessX's
  inverse-scaling figure
- [ ] 3.3 Surface the held-out caveat in the report (gains measured on the eval set)

## 4. Validate the finding

- [ ] 4.1 Compute the per-target slope on current data; state whether codingharness
  reproduces HarnessX's negative-slope (inverse-scaling) shape, with coverage honesty
- [ ] 4.2 If coverage is too sparse, recommend a small deliberate baseline-coupling
  run set (framework + baseline on the same model/target) rather than over-reading
  thin history — REAL SPEND, scoped separately

## 5. Decision

- [ ] 5.1 Go/no-go: is the report sound and the curve legible on real data?
- [ ] 5.2 If go: scoped follow-on to ship the report/view, and optionally a
  cost-adjusted "gain per dollar" recommender (the harness-vs-model-upgrade decision)

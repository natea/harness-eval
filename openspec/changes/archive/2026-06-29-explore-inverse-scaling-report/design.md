# Design: Inverse-Scaling Report

## Context

A run's results record, per candidate, absolute and run-relative dimensions
(file: src/report/results.ts; file: src/grading/scoring.ts): `prdAdherence` and
`codeQuality` are absolute 0–100 (the graded score and judge median), while
`speed` and `tokenSpend` are min-max normalized across candidate means *within the
run* (function: normalizeAcrossCandidates). Each score row carries `candidate`,
`harness`, `model`, and `dimensions`. The registry has no-framework anchors
(file: config/registry.yaml, ids: bare, codex-baseline). The target is recoverable
per run from its PRD hash (studio endpoint `/api/runs/:id/target`).

## Decisions

### 1. The quantities

For a fixed target T, model M, harness, and a framework candidate F:

```
baseline(M, T)      = adherence(bare or codex-baseline, M, T)   // model's raw strength
marginalGain(F,M,T) = adherence(F, M, T) − baseline(M, T)       // the framework's lift
```

`adherence` is the **absolute** `prdAdherence` (graded score); `codeQuality` is
reported as a secondary y. The **composite is deliberately not used** — it folds
in run-normalized speed/tokenSpend, which are meaningless across models/runs. This
is the single most important correctness rule of the report.

The inverse-scaling plot is then: x = `baseline(M, T)`, y = `marginalGain(F, M, T)`,
one point per (F, M), faceted by target T, colored by model. HarnessX predicts a
negative slope (lower baseline → larger gain); the report computes the slope and
states whether codingharness reproduces it.

### 2. Baseline selection

The anchor is the no-framework candidate on the *same harness*: `bare` for
claude-code/zerocode, `codex-baseline` for codex. If no baseline cell exists for a
(M, T), that cell is omitted with a logged reason (not silently dropped). This is
the inverse-scaling analogue of the existing "don't pool across PRDs" discipline:
gains are only computed against a like-for-like baseline.

### 3. Cross-run joining (data sufficiency)

The cleanest cell has F and its baseline in the *same* run. Historical runs are
often single-candidate, so the report joins cells across runs by (target, model,
harness), reusing the merge logic of the cross-run aggregator (file:
scripts/combined-report.ts) — but only joining runs that share the frozen PRD hash
(comparability), exactly as that script already enforces. Cells assembled from
different runs are tagged so the provenance is auditable.

### 4. The artifact

- A **table**: target × framework × model → baseline, with-framework, marginal
  gain (±σ), n.
- A **chart**: the scatter + trend line per target, mirroring HarnessX's
  inverse-scaling figure. Rendered in the studio (file: src/studio/views/, a new
  view) and exportable; a CLI/markdown variant alongside src/report/markdown.ts.
- A one-line **slope readout** per target ("framework value decays −k pts of gain
  per +10 pts of baseline strength"), the publishable headline.

### 5. Rigor

- **Low-n:** marginal gains from n=1–2 trials are noisy; carry per-cell stddev and
  flag thin cells `inconclusive` (reuse the existing inconclusive concept in
  results), never presenting a single-trial delta as a trend.
- **Held-out caveat:** gains are measured on the eval set, the same limitation
  HarnessX discloses (§7.7); the report states this so the curve is not
  over-read as out-of-distribution generalization.

## Risks / trade-offs

- **Composite contamination** — using the composite (with normalized speed/spend)
  would silently corrupt the curve; the report must hard-gate to absolute
  dimensions. This is the dominant correctness risk.
- **Sparse matrix** — without baselines on every model/target, the curve has few
  points; the exploration must report coverage honestly and may recommend a small,
  deliberate baseline-coupling run set rather than mining only history.
- **Over-claiming generality** — a negative slope on our targets is not proof of a
  universal law; report it as observed-on-these-targets, with the held-out caveat.

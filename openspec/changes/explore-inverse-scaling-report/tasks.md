# Tasks: Explore Inverse-Scaling Report

## 1. Define the quantities

- [x] 1.1 Pin the definitions: marginalGain(F,M,T) = adherence(F,M,T) −
  adherence(baseline,M,T); baseline strength = adherence(baseline,M,T), using the
  **absolute** `prdAdherence` (and `codeQuality` as a secondary y)
- [x] 1.2 Hard-gate the report to absolute dimensions: assert it never reads the
  composite or the run-normalized `speed`/`tokenSpend` (src/grading/scoring.ts)
- [x] 1.3 Baseline selection: `bare` for claude-code/zerocode, `codex-baseline` for
  codex; omit (with a logged reason) any (M,T) cell lacking a like-for-like baseline

## 2. Assemble the matrix from existing data

- [x] 2.1 Build a derived aggregator over `runs/*/results.json` that joins cells by
  (target, model, harness), reusing the same-PRD-hash comparability rule from
  scripts/combined-report.ts; tag cross-run-assembled cells with provenance
  (`src/report/inverse-scaling.ts`; cells carry `runIds`, `⊕` in the view)
- [x] 2.2 Report coverage: how many (framework, model, target) cells have both a
  framework and a baseline; flag thin cells `inconclusive` with per-cell stddev
  (`low-n` / `high-σ` flags)

## 3. The report + view

- [x] 3.1 Markdown/CLI report: target × framework × model table (baseline,
  with-framework, marginal gain ±σ, n) + a per-target slope readout
  (`scripts/inverse-scaling-report.ts`)
- [x] 3.2 Studio view: marginal gain vs. baseline strength on both absolute axes,
  with the baseline→framework delta made loud (green ▲ / red ▼) + per-axis fit
  cards mirroring HarnessX's inverse-scaling figure (`InverseScaling.tsx`,
  `/api/inverse-scaling`)
- [x] 3.3 Surface the held-out caveat in the report (gains measured on the eval set)

## 4. Validate the finding

- [x] 4.1 Compute the slope on current data; state whether codingharness reproduces
  HarnessX's negative-slope (inverse-scaling) shape, with coverage honesty
  (cross-target fit: adherence r −0.43, quality r −0.64 — reproduced; per-framework
  divergence: gsd r −0.94 strong, superpowers inverts)
- [x] 4.2 Baseline-coupling: graded the notes/codex cluster (zero-spend unlock) and
  ran `bare @ claude-code/opus-4-6` on rest-api + symphony-daemon. **Open:** all
  cells are n=1 so the confident fit is `n/a` — the n≥2 hardening is carried to 5.2.

## 5. Decision

- [x] 5.1 Go/no-go — **GO.** The report is sound (absolute dims only, like-for-like
  baselines, no PRD pooling, low-n/high-σ flagged, held-out caveat) and the curve is
  legible on real data: inverse-scaling reproduces on both axes, and the
  per-framework split (gsd embodies it, superpowers inverts) is a sharper claim than
  the aggregate. The view makes the increase/decrease the headline.
- [ ] 5.2 Follow-on (separate, real-spend): **(a)** re-run the baselines at n≥2 so
  `low-n` clears and the confident fit computes — the one gap before the curve is
  publishable; **(b)** a cost-adjusted "gain per dollar" recommender (harness-vs-
  model-upgrade decision), which needs absolute token cost re-derived from
  transcripts. OpenSpec bookkeeping: this exploration concluded GO and the
  implementation shipped (PR #60) — promote to/Archive once 5.2(a) lands.

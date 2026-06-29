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
  HarnessX's negative-slope shape. **Result, post-hardening:** the all-cells fit is
  weakly negative (adherence r −0.19, quality r −0.30) and the confident-only fit is
  essentially flat (adherence slope −0.03; quality +1.51, r 0.57). The dramatic
  inverse-scaling seen at n=1 did NOT survive replication — see 4.2.
- [x] 4.2 Baseline-coupling DONE: graded the notes/codex cluster (zero-spend) and
  hardened the symphony-daemon bare baseline from n=1 → n=3 (graded the salvaged
  built trials of an interrupted run via the killed-run fallback). This **corrected
  a single-trial artifact**: the lone n=1 symphony baseline scored adherence 70.9 (a
  low outlier); the real baseline is ~80.7, which collapsed the framework adherence
  "gains" (gsd +10.3 → +0.5; compound +8.2 → −1.6; superpowers −6.2 → −16.1).
  Frameworks still lift code QUALITY on symphony (gsd +12.2), just not adherence.
  rest-api framework cells remain n=1 (would need framework re-runs — minor).

## 5. Decision

- [x] 5.1 Go/no-go — **GO** (method sound; the report did its job). The headline
  finding flipped under rigor and that IS the value: absolute-dims-only, like-for-
  like baselines, low-n/high-σ flagging, and n≥2 hardening caught a single-trial
  artifact that had manufactured a dramatic effect. Honest conclusion on current
  data: inverse-scaling is weak/noisy and framework-dependent; frameworks move code
  quality more than adherence; the bare claude-code agent is already strong on spec
  adherence.
- [ ] 5.2 Follow-on (separate, real-spend): **(a)** raise the remaining single-trial
  cells (rest-api frameworks) to n≥2 for full confidence; **(b)** a cost-adjusted
  "gain per dollar" recommender (harness-vs-model-upgrade), needing absolute token
  cost re-derived from transcripts. Bookkeeping: GO; implementation shipped (PR #60).
  Archive this explore change once 5.2(a) lands; (b) is its own change.

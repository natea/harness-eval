# Explore: Inverse-Scaling Report (marginal harness gain vs. baseline strength)

## Why

HarnessX (Xiaomi, arXiv 2606.14249) reports an **inverse-scaling** result: the
gain from improving the harness is largest where the model is weakest — Qwen3.5-9B
+44.0% on ALFWorld vs. Claude Sonnet 4.6 +11.2%, with gains tracking inverse
baseline performance across five benchmarks. The popular framing (VentureBeat,
2026-06-24) turns this into a buyer's decision: *for teams on smaller models, the
gains are large enough to justify evaluating harness evolution before paying for a
frontier model.*

That decision — **improve the harness or upgrade the model?** — is exactly what
codingharness is built to settle, and we already collect the data to answer it:
absolute PRD-adherence and code-quality scores per candidate, per worker model,
per target (file: src/report/results.ts; file: src/grading/scoring.ts), plus a
`bare`/`codex-baseline` "no framework" anchor in the registry (file:
config/registry.yaml, ids: bare, codex-baseline). No other eval can produce a
clean "framework's marginal value as a function of model strength" curve. This is
the single most publishable output the harness × model matrix enables, and it
reuses data we have rather than running anything new.

This change explores a derived **inverse-scaling report**: for each framework on
each model (within a fixed target), the marginal gain over the no-framework
baseline, plotted against that model's baseline strength — and whether the
codingharness data reproduces HarnessX's negative-slope shape.

## What to explore

1. **Marginal gain + baseline strength definitions.** Marginal gain of framework
   F on model M (target T) = score(F, M, T) − score(bare, M, T); baseline strength
   = score(bare, M, T), the model's raw capability with no framework.
2. **The absolute-dimension constraint (a real gotcha).** Only `prdAdherence` and
   `codeQuality` are absolute 0–100; `speed` and `tokenSpend` are min-max
   normalized *within each run* (file: src/grading/scoring.ts,
   function: normalizeAcrossCandidates) and are NOT comparable across runs/models.
   The report must use the absolute dimensions, not the composite.
3. **Data sufficiency / baseline coupling.** A clean cell needs the framework AND
   the baseline run on the *same* model + target. Many historical runs are
   single-candidate; assess joining cells across runs (the cross-run aggregator
   pattern, file: scripts/combined-report.ts) and/or a "baseline coupling" rule.
4. **The artifact.** A scatter/curve (x = baseline strength, y = marginal gain,
   one point per framework×model, faceted by target — no cross-PRD pooling) with a
   trend line, plus a backing table, surfaced as a CLI report and a studio view.
5. **Rigor.** Per-cell variance / low-n handling (flag thin cells inconclusive),
   and the held-out caveat (gains are measured on the eval set, as HarnessX's are).

## Out of scope (until the exploration recommends it)

Mandating a `bare` baseline in every run, a cost-adjusted "gain per dollar"
recommender (a strong follow-on), or any change to how trials are graded. This
change defines and prototypes the report and reports whether the data supports it.

## Impact

- New (exploratory) spec: `inverse-scaling-report`.
- Touches (later, if adopted): a derived report alongside src/report/, a studio
  view (file: src/studio/views/), and reuse of src/grading/scoring.ts +
  src/report/results.ts. No new runs, no grading changes.
- Methodology preserved: per-target (never cross-PRD-pooled), absolute dimensions
  only, low-n flagged, held-out caveat surfaced.

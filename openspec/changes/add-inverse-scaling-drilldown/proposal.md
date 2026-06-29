# Add: Inverse-scaling drill-through + per-page studio titles

## Why

The inverse-scaling view shows one aggregated row per (target × framework ×
model): the baseline→framework move on adherence and code quality. But the
numbers are assembled from individual graded trials, and the view gave no way to
see them — an operator who distrusts a delta (especially a thin low-n or
assembled-across-runs cell) had to leave the page and hunt through `runs/` by
hand. The data behind every row already exists; it just was not surfaced.

Separately, every studio page shared one static browser-tab title ("Eval
Studio"), so bookmarks and multiple open tabs were indistinguishable and did not
match the product's name.

## What Changes

- The inverse-scaling report exposes, per cell, the individual graded trials
  behind each side (framework and baseline): run id, trial id, and the trial's
  adherence + quality. This is additive provenance over the existing aggregate.
- The inverse-scaling studio view makes each row expandable to a drill-through
  panel listing those trials, each linking to its trial scorecard.
- The studio sets a per-page document title of the form
  `CodingHarness — <page>` so tabs and bookmarks are meaningful and carry the
  project name.

## Out of scope (this change)

- Changing the aggregation, the fit, or which dimensions are reported.
- Any new grading or real spend.

## Impact

- Specs: `inverse-scaling-report` (drill-through provenance), `eval-studio`
  (per-page titles + the drill-through UI).
- Code: `src/report/inverse-scaling.ts`, `src/studio/views/InverseScaling.tsx`,
  `src/studio/frontend.tsx`, `src/studio/index.html`.

# Design: Inverse-scaling drill-through + per-page titles

## Drill-through provenance

`buildInverseScaling` already groups trials per (target|harness|model|candidate)
and means them into a cell. The only change is to retain, per trial, its
`trialId` and `candidate` alongside the `runId` it already carried, and to emit
two lists on each cell — `frameworkTrials` and `baselineTrials` — built from the
same trial arrays the means come from. Per-trial quality is the criteria mean
(0–10); it is scaled ×10 to 0–100 so the drill-through rows read on the same
scale as the cell's headline quality. The aggregate values are untouched, so the
fit and flags are unaffected.

`trialId` is read from provenance; when a killed-but-graded run is scanned by
trial directory, the directory name is the authoritative `trialId` if provenance
omits it.

## Studio rendering

The view mirrors the report type (it cannot import the node:fs-bound module) and
adds the two trial-list fields. Each row gains a disclosure caret and toggles an
expanded detail row (a full-width panel) holding two `TrialList`s — framework and
baseline — each linking to `/runs/<runId>/trials/<trialId>`. Expansion state is
local component state keyed by the row's identity; rows expand independently.

## Titles

Routing is full-page (anchor navigation), so a single effect on mount maps
`window.location.pathname` to a page name and sets
`document.title = "CodingHarness — <page>"`. `index.html` carries
`CodingHarness` as the pre-render default. The brand string is defined once in
`frontend.tsx` next to the routing so the title map and the nav wordmark stay in
step.

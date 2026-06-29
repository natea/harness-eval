# Tasks: Inverse-scaling drill-through + per-page studio titles

## 1. Report provenance

- [x] 1.1 Retain `trialId` + `candidate` on each in-cell trial (read trialId from
  provenance; fall back to the trial-dir name for killed-but-graded scans)
- [x] 1.2 Emit `frameworkTrials` + `baselineTrials` per cell (`InvScaleTrialRef`:
  runId, trialId, candidate, adherence, quality), quality scaled ×10 to 0–100;
  aggregates/fit/flags unchanged

## 2. Studio drill-through UI

- [x] 2.1 Mirror the new fields in the view's `Cell` type; add a `TrialList`
  component linking each trial to `/runs/<runId>/trials/<trialId>`
- [x] 2.2 Make each inverse-scaling row expandable (caret + independent toggle
  state) revealing framework + baseline trials; non-linkable trials still listed

## 3. Per-page titles

- [x] 3.1 Map the current path to a page name and set
  `document.title = "CodingHarness — <page>"` on mount; `index.html` default title
  set to `CodingHarness`

## 4. Validate

- [x] 4.1 `bunx tsc --noEmit` clean for the touched files; studio frontend bundles
- [x] 4.2 Live `/api/inverse-scaling` returns `frameworkTrials`/`baselineTrials`
  for every cell (verified: 13/13)

# Extend the PRD Library with More ViBench Targets

## Why

The eval is only as broad as its target library. `impl-extend-prd-library` (PR #34)
adapted six ViBench PRDs into frozen targets (barber→web-app, logistics→rest-api,
market_place→marketplace, collabrative_kaban→kanban, notes, pilot_logbook). The
[ViBench public set](https://github.com/ViBench/vibench-public/tree/main/prds)
holds **~18 more** unused PRDs spanning fresh domains — `slack`, `srm`,
`fleet_management`, `resume_builder`, `quiz`, `energy_audit`, `language_learning`,
`hvac`, `online_whiteboard`, `wedding`, `mafia`, `monopoly`, and others.

More targets means more, more-varied head-to-head cells — richer inverse-scaling
coverage and fuller bracket fields — from a source we already use and attribute.

## What Changes

- **Adapt a batch of unused ViBench PRDs into new frozen targets** (Apache-2.0,
  provenance recorded), each a `targets/<name>/` with `target.yaml` (incl. a
  `source:` block: upstream `vibench-public`, repo, commit `5baa6892bad7…`,
  `originalDir`, license, adaptation note), `PRD.md`, and `testplan.yaml`, with PRD
  and test-plan content hashes frozen — the same shape as the existing targets.
- **Recommended first batch** (distinct domains, API-adaptable, low overlap with
  the current set): `slack`, `srm`, `fleet_management`, `resume_builder`,
  `energy_audit`, `quiz`. The remaining ViBench PRDs are follow-on batches.
- **Skip already-adapted PRDs:** barber, collabrative_kaban, logistics,
  market_place, notes, pilot_logbook.
- **Adaptation rule (preserve fairness/comparability):** ViBench PRDs are
  browser/UI-driven; adapt each to an HTTP/JSON API target (drop DOM/interaction
  testing) where needed — exactly as the existing targets did — keeping every
  REQUIRED behavior gradable cold by the existing test-plan harness.
- **Attribution:** extend `targets/NOTICE` so every new adapted PRD carries its
  upstream attribution.

## Out of scope

- Browser-driven / DOM grading (the harness grades cold HTTP/JSON + served pages;
  full UI interaction testing stays dropped).
- Re-freezing or changing any existing target.
- Running anything — adding targets is zero-spend; using them in runs is separate.

## Impact

- Modified capability: `eval-targets` (the catalog grows; provenance + freeze rules
  unchanged, applied to new entries).
- Touches `targets/<new>/**`, `targets/NOTICE`, and the regenerated `docs/TARGETS.md`
  catalog. No grading-logic change; `bun run src/cli.ts validate` covers the new
  targets' schema + freeze + coverage.

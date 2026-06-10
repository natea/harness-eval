# Design: Results Dashboard

## Context

Run artifacts already form a complete, stable data layer: `runs/<run-id>/results.json` (schemaVersion 1, scores keyed by candidate/harness/model, trials with provenance+telemetry), per-trial `grades.json` (step results with evidence, judge criteria with samples), transcripts, and provenance files. The reporting capability guarantees re-weighting needs only stored per-dimension scores. CLAUDE.md mandates Bun-native tooling: `Bun.serve()` with HTML imports, React, no Vite/webpack.

## Goals / Non-Goals

**Goals:**
- Explorable grades: leaderboard → run → trial → step/sample, every score traceable to its evidence.
- Cross-run and (future) cross-harness comparison from the same UI.
- Zero infrastructure: one process, no DB, no build pipeline beyond `bun`.

**Non-Goals:**
- Public hosting, auth, or multi-user state (localhost tool).
- Editing/re-grading from the UI (read-only; the CLI owns mutations).
- Real-time build monitoring of in-flight runs (nice-to-have later; this change renders completed artifacts, plus a soft refresh).

## Decisions

- **D1 — No database; filesystem scan per request.** `runs/` is small (tens of runs × KBs of JSON). A `GET /api/runs` handler globs `runs/*/results.json`, parses with the existing zod schemas (validation for free), and joins per-trial `grades.json` lazily. Index cached in memory with mtime invalidation.
- **D2 — Single Bun server, HTML imports.** `src/dashboard/index.ts` serves `index.html` importing `app.tsx` (React); Bun bundles transparently. Routes: `/` (leaderboard), `/runs/:id`, `/runs/:id/trials/:trialId`; API: `/api/runs`, `/api/runs/:id`, `/api/runs/:id/trials/:trialId`. Bind `127.0.0.1` by default (artifacts contain workspace paths and evidence text; not for the open network).
- **D3 — Leaderboard aggregation = mean of per-run composites per (candidate, harness, model)**, with run filters (run ids, harness, model, provider). Speed/spend dimension scores are run-relative (min-max normalized within each run) — the UI labels them as such and never averages them across runs with different candidate sets without a visible warning badge. Adherence/quality are absolute and aggregate cleanly.
- **D4 — Client-side re-weighting** reuses the same weighted-sum formula (shared TS module imported by both CLI scoring and the frontend) so UI numbers can never drift from `report --weights` output.
- **D5 — Evidence rendering**: step evidence and judge justifications render as preformatted text with truncation+expand; transcripts are linked by path, not embedded (multi-MB files).

## Risks / Trade-offs

- [Cross-run leaderboard mixing incomparable normalized dimensions] → D3 warning badges; default leaderboard groups by identical run-config hash and offers "absolute dimensions only" mode.
- [Schema evolution breaking old runs] → schemaVersion gate: known versions render; unknown render a "regenerate with `report`" notice per run instead of failing the page.
- [Large grades.json evidence blobs slowing the index] → grades joined only on trial-detail routes, never for the leaderboard.
- [Two scoring implementations drifting] → single shared scoring module (D4) with a unit test asserting CLI and dashboard produce identical composites for a fixture run.

## Open Questions

- Charts (per-dimension bar/spread visuals): include a minimal dependency-free SVG approach in v1, or text-first tables only? (Default: tables + simple inline SVG bars, no chart library.)
- Should the dashboard also surface the real-integration bonus tier when present? (Default: yes, as a separate badge outside the composite, mirroring the markdown scorecard.)

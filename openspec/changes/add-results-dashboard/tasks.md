# Tasks: Add Results Dashboard

## 1. Data Layer

- [ ] 1.1 Extract shared scoring module (weighted composite + normalization) consumed by CLI and dashboard; parity unit test against a fixture run
- [ ] 1.2 Implement run-index loader: glob `runs/*/results.json`, zod-validate, mtime-cached; lazy per-trial grades join; schemaVersion gate

## 2. Server and API

- [ ] 2.1 `src/dashboard/index.ts` — `Bun.serve()` on 127.0.0.1 with HTML imports; routes `/`, `/runs/:id`, `/runs/:id/trials/:trialId`; API endpoints `/api/runs`, `/api/runs/:id`, `/api/runs/:id/trials/:trialId`
- [ ] 2.2 `bun run dashboard` script; `--port` flag

## 3. Frontend

- [ ] 3.1 Leaderboard view (ranked table, dimension columns, flags, run/harness/model filters, normalization warning badges)
- [ ] 3.2 Run scorecard view (ranking, weights, exclusions, provenance)
- [ ] 3.3 Trial drill-down (test-plan steps with expandable evidence, judge criteria with samples/justifications, telemetry, status causes; bonus-tier badge when present)
- [ ] 3.4 Criterion comparison view (one dimension or step across candidates/trials)
- [ ] 3.5 Re-weighting controls with instant client-side recompute via the shared module

## 4. Validation

- [ ] 4.1 Unit tests: index loader (schema gate, cache invalidation), API responses against fixture runs
- [ ] 4.2 Render check against real artifacts (GSD run + cloud 3-candidate run); verify leaderboard, drill-down evidence, and CLI re-weighting parity
- [ ] 4.3 Document usage in README/docs

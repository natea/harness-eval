# Tasks: Add Input-Spec Viewer

## 1. Serve the input spec

- [ ] 1.1 `GET /api/runs/:id/prd` — resolve the run's `prdSha256` → target (reuse
  the `targetBySha()` match), return `{ name, title, prd, testPlan, sha,
  currentMatch }`; read-only
- [ ] 1.2 Re-frozen / unknown hash: return `currentMatch: false` with `prd: null`
  and a note rather than serving a mismatched document
- [ ] 1.3 404 only when the run itself doesn't exist; a resolvable run with no
  current-target match still returns the `currentMatch: false` shape

## 2. Spec panel in the run view

- [ ] 2.1 RunView "Spec" disclosure (`<details>`, collapsed by default) beneath the
  target line, fetching `/api/runs/:id/prd`
- [ ] 2.2 Render PRD + test plan as raw markdown/YAML in `<pre className=
  "whitespace-pre-wrap">` (no new markdown dependency)
- [ ] 2.3 On `currentMatch: false`, show a warn badge ("this run's frozen PRD
  differs from the current target version") instead of stale text

## 3. Verify

- [ ] 3.1 Endpoint returns the PRD for a current-target run; returns the
  `currentMatch: false` shape for a re-frozen/unknown hash; 404 for a missing run
- [ ] 3.2 RunView renders the panel; tsc + biome clean; studio serves the route

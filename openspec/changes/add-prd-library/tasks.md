# Tasks: Add PRD Library and Custom PRD Support

## 1. Target Abstraction

- [x] 1.1 Define target manifest schema (zod) and loader with hash/coverage-mode validation
- [x] 1.2 Migrate Symphony content-identical into `targets/symphony-daemon/` (PRD, test plan, mock Linear, stub app-server); update CLI/grading paths; assert hashes unchanged
- [x] 1.3 Parameterize the base prompt template with target slots (PRD file, conformance pointer, deliverables); default `--target symphony-daemon`
- [x] 1.4 Generalize fixture lifecycle: grading runner starts/stops manifest-declared fixture processes per trial
- [x] 1.5 Add optional `source` provenance block to the manifest schema (upstream, repo URL, commit SHA, original dir, license); `validate --target` requires complete fields when `source.upstream` is present; add `targets/NOTICE` carrying ViBench's Apache-2.0 copyright/NOTICE text

## 2. CLI

- [x] 2.1 `init --target <name> --spec <file>` scaffolding (manifest + test-plan skeleton; optional LLM-assisted draft step documented as requiring human review)
- [x] 2.2 `validate --target <name>`; wire into run preflight
- [x] 2.3 Record target name/version/hashes in provenance, results.json, and scorecards; reporting refuses cross-target aggregation

## 3. Library Targets

- [x] 3.1 Author `cli-tool` target (PRD, weighted test plan with fatal gates, exit-code/stdout fixtures); smoke trial
- [x] 3.2 Adapt `rest-api` target from ViBench `logistics`: `PRD.md` (API-only reframe), `testplan.yaml` (9 HTTP-observable steps, fatal cold-start gate, hand-derived ROI worked example), `source` provenance; validates. Smoke trial (gsd, worktree, 14.2m, completed): built server returns the exact ROI worked example (3100/3970/3100), insights/quote-persist/admin-auth/validation all conformant.
- [x] 3.3 Adapt `web-app` target from ViBench `barber`: `PRD.md` (HTTP/JSON API behind the schedule UI + served page, HTTP-light v1), `testplan.yaml` (10 steps, fatal gate, fixed seed date), `source` provenance; validates + exercised by the 4.2 dry run. Smoke trial (gsd, worktree, 14.2m, completed): built server passes create/double-book-409/bad-slot-400/immutable-PATCH-400/delete-204 and serves HTML root.
- [x] 3.4 Per-target budget defaults in run config

## 4. Validation and Docs

- [x] 4.1 Unit tests: manifest validation, migration hash parity, cross-target aggregation refusal
- [x] 4.2 End-to-end dry run on a non-Symphony target (`tests/e2e-dry-target.test.ts`: web-app target through orchestration → grading → scorecard, fake executor, no spend)
- [x] 4.3 Author "bring your own PRD" guide in `docs/`

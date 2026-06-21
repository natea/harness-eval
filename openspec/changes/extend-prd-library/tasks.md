# Tasks: Extend the PRD library (diverse, described catalog)

## 1. Manifest catalog metadata

- [x] 1.1 Extend `TargetManifest` in `src/targets.ts` with `summary` (string),
  `description` (string), and `tags` (`{ domain: string, shape: string,
  expectedUI: 'none' | 'served-page' | 'interactive' }`) — added as optional first
- [x] 1.2 Backfill the new fields into the 4 existing manifests
  (`symphony-daemon`, `web-app`, `cli-tool`, `rest-api`); `web-app.expectedUI`
  = `served-page` (documents the HTTP-light stub reality)
- [x] 1.3 Flip the new fields to required in the schema; `loadTarget` fails with a
  field-naming message when any is missing
- [x] 1.4 Update the `scaffoldTarget` skeleton to include the catalog fields as
  TODO placeholders so bring-your-own targets self-describe
- [x] 1.5 Confirm catalog metadata is NOT referenced by `renderTargetPrompt`
  (fairness: descriptive only) — add a test asserting it's absent from rendered output

## 2. Adapt the ViBench catalog subset (HTTP-light, frozen, attested)

- [x] 2.1 Fetch the candidate ViBench PRDs at a pinned commit and vet each for
  HTTP-observability; record the final selection (≥4) and pinned commit
- [x] 2.2 Adapt target **notes** (CRUD + search): PRD.md, HTTP-observable
  weighted testplan.yaml (fatal cold-start gate + one step per REQUIRED item),
  target.yaml (attestation mapping, `source:` provenance, catalog fields), freeze hash
- [ ] 2.3 Adapt target **quiz** (stateful sessions + scoring) — same deliverables as 2.2
- [x] 2.4 Adapt target **kanban** (ordered collections + move ops) — same deliverables
- [ ] 2.5 Adapt target **marketplace** (multi-actor offers + state) — same deliverables
- [x] 2.6 Adapt target **pilot-logbook** (validation + aggregation/totals) — same deliverables
- [ ] 2.7 Adapt target **resume-builder** (nested structured document + validation) — same deliverables
  (swap any of 2.2–2.7 that proves a poor HTTP fit during 2.1; keep ≥4 shipped)
- [x] 2.8 Verify `targets/NOTICE` covers every adapted target's upstream; each
  manifest `source` block is complete (upstream, repo, pinned commit, originalDir, license)

## 3. Generated, drift-checked catalog document

- [x] 3.1 Write a catalog generator (CLI `catalog` subcommand or
  `scripts/gen-catalog.ts`) that reads all manifests and emits `docs/TARGETS.md`
  (name, summary, description, shape, expectedUI, provenance), line-ending-normalized
- [x] 3.2 Add a drift check (folded into `validate`) that regenerates in-memory and
  fails if `docs/TARGETS.md` is stale
- [x] 3.3 Generate and commit `docs/TARGETS.md`

## 4. Surface descriptions at selection time

- [x] 4.1 CLI: target listing + the `no target '<name>'` available-list +
  `validate` summary show `name — summary [shape, expectedUI]`
- [x] 4.2 Studio: configure-view target picker shows `summary`, `shape`,
  `expectedUI` (eval-studio delta) reading from the loaded manifest

## 5. Validation

- [ ] 5.1 `bun run src/cli.ts validate` passes for the whole library (schema, hash
  freshness, attestation presence, complete provenance, catalog drift check)
- [x] 5.2 Unit tests: required-field enforcement; prompt-exclusion of catalog
  metadata; generator output stable; drift check fails on a mutated manifest
- [ ] 5.3 Smoke (n=1) at least one new HTTP-light target end-to-end (build → grade)
  to confirm the test plan is graders-observable
- [ ] 5.4 `openspec validate extend-prd-library --strict` passes

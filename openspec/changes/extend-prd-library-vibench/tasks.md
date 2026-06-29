# Tasks: Extend the PRD Library with More ViBench Targets

## 1. Select the batch

- [ ] 1.1 Confirm the first batch (distinct domains, API-adaptable, no overlap with
  the 6 existing): slack, srm, fleet_management, resume_builder, energy_audit, quiz
- [ ] 1.2 Pull each PRD's `prds/<x>/{prd,tests}` from ViBench at commit
  `5baa6892bad7…` for adaptation reference

## 2. Adapt each target (repeat per PRD)

- [ ] 2.1 Scaffold `targets/<name>/` (`init --target`), author the adapted `PRD.md`
  (browser → HTTP/JSON API + served page where implied; REQUIRED behaviors kept)
- [ ] 2.2 Author `testplan.yaml` — cold, unambiguous steps grading every REQUIRED
  item; fatal gates + bonus marked; no task hints leaked to candidates
- [ ] 2.3 `target.yaml`: manifest + `source:` block (upstream `vibench-public`,
  repo, commit `5baa6892bad7…`, `originalDir: prds/<name>`, `license: Apache-2.0`,
  adaptation note stating what DOM/interaction grading was dropped); set coverageMode
- [ ] 2.4 Freeze PRD + test-plan content hashes (scaffold/freeze flow)

## 3. Attribution + catalog

- [ ] 3.1 Extend `targets/NOTICE` with each new adapted PRD's upstream attribution
- [ ] 3.2 `bun run src/cli.ts catalog` to regenerate `docs/TARGETS.md`

## 4. Validate

- [ ] 4.1 `bun run src/cli.ts validate` passes for every new target (schema, freeze
  binding, coverage-mode obligations, NOTICE present)
- [ ] 4.2 Spot-check one new target end-to-end with `bare` (smoke, real spend) to
  confirm the test plan grades sensibly cold — optional, gated on a go-ahead

## 5. Follow-on batches

- [ ] 5.1 Remaining ViBench PRDs in later batches (book_journey, canary,
  creative_community, family_*, furniture_freight, hvac, language_learning, mafia,
  monopoly, online_whiteboard, wedding) — UI/real-time ones deprioritized or
  `attested`

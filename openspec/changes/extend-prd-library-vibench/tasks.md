# Tasks: Extend the PRD Library with More ViBench Targets

## 1. Select the batch

- [x] 1.1 Confirm the first batch (distinct domains, API-adaptable, no overlap with
  the 6 existing): slack, srm, fleet_management, resume_builder, energy_audit, quiz.
  Cleanest-for-cold-grading ranking found while authoring: **fleet_management**
  (pure CRUD + deterministic arithmetic) > energy_audit (calc engine, but needs
  seed-data.json + a log-log regression worked example) > srm (large multi-role
  platform: auth/RBAC/kanban/RFQ) > quiz (random sampling + CSV; only
  deterministic via a fixed ≥10-question category) > slack/resume_builder
  (real-time / free-form output — weak cold contracts).
- [x] 1.2 Pull each PRD's `prds/<x>/{prd,tests}` from ViBench at commit
  `5baa6892bad7…` for adaptation reference (pulled mvp.txt for the batch)

## 2. Adapt each target (repeat per PRD)

> First authored target: **fleet-management** (2.1-2.4 + 3.x + 4.1 complete,
> validated). Remaining batch targets follow the same flow — see §6.

- [x] 2.1 Scaffold `targets/fleet-management/` (`init --target`), author the adapted
  `PRD.md` (browser → HTTP/JSON API; all REQUIRED behaviors kept)
- [x] 2.2 Author `testplan.yaml` — 13 cold steps grading every REQUIRED item
  R1-R10; fatal cold-start gate (S-1) + one bonus (DEL-2); no task hints leaked
- [x] 2.3 `target.yaml`: manifest + `source:` block (vibench-public, commit
  `5baa6892…`, `originalDir: prds/fleet_management`, `license: Apache-2.0`,
  adaptation note: UI/DOM + offline/localStorage + delete-confirm dropped)
- [x] 2.4 Freeze PRD + test-plan hashes (PRD `8c8b9801…`, plan `ea6efbd0…`)

## 3. Attribution + catalog

- [x] 3.1 `targets/NOTICE` ViBench attribution present — it is generic (points at
  each target.yaml `source:` block), so it already covers fleet-management
- [x] 3.2 `bun run src/cli.ts catalog` regenerated `docs/TARGETS.md` (fleet-management listed)

## 4. Validate

- [x] 4.1 `bun run src/cli.ts validate --target fleet-management` passes (schema,
  freeze binding, attested-coverage obligation, NOTICE present; catalog up to date)
- [ ] 4.2 Spot-check one new target end-to-end with `bare` (smoke, real spend) to
  confirm the test plan grades sensibly cold — optional, gated on a go-ahead
  (deferred: no real spend overnight)

## 6. Remaining first-batch targets (author next, same flow as §2)

- [ ] 6.1 **energy_audit** — calc engine (ACH50 blower-door + duct-leakage
  compliance). Needs the `assets/mvp-seed-data.json` calibration constants
  bundled as a fixture + a hand-worked log-log regression example; closest in
  shape to `rest-api`. Highest-value next target.
- [ ] 6.2 **srm** — supplier scoring (`p×0.35 + q×0.35 + r×0.30`, rounded) + the
  request→RFQ→order state machine + auto stage-movement. Scope down to the
  scoring + lifecycle API; drop the full RBAC/kanban UI.
- [ ] 6.3 **quiz** — deterministic-play API over a fixed ≥10-question category
  (bundle `assets/questions.csv`); grade streak/achievement (Perfect Round / Hot
  Streak ≥5 / Triple Win ≥3) + scoring. Drop random sampling (use a full category).
- [ ] 6.4 **resume_builder / slack** — weak cold contracts (free-form document
  output / real-time messaging). Defer or mark `attested` with a narrow API slice.

## 5. Follow-on batches

- [ ] 5.1 Remaining ViBench PRDs in later batches (book_journey, canary,
  creative_community, family_*, furniture_freight, hvac, language_learning, mafia,
  monopoly, online_whiteboard, wedding) — UI/real-time ones deprioritized or
  `attested`

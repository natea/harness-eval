# Design: PRD Library and Custom PRD Support

## Context

The harness hard-codes one target: `prd/symphony-SPEC.md`, `config/testplan.yaml`, and Symphony-specific fixtures (mock Linear, stub app-server), with the base prompt referencing §18.1 by name. Grading methodology (frozen weighted test plan, adaptive evaluator, blind judge) is target-agnostic already; only the *content* is Symphony-shaped. ViBench demonstrates the multi-target pattern: uniform PRD format, per-task human-authored test plans, one evaluator harness.

## Goals / Non-Goals

**Goals:**
- N targets, one methodology: selecting `--target` swaps PRD, test plan, fixtures, and prompt parameters with zero changes to orchestration, drivers, or scoring.
- Custom targets are first-class: same manifest, same validation, same freeze rules as shipped targets.
- Existing Symphony results stay valid and comparable (file moves preserve content hashes).

**Non-Goals:**
- Cross-target score aggregation (different plans = different scales; reporting refuses it).
- Auto-generated test plans without human review (LLM drafts allowed; a human attests coverage before a target is run-eligible).
- Browser-automation evaluator for the web-app target in this change's first cut (the target ships; its evaluator tooling may use the REPL pattern with HTTP checks before Playwright integration is added).

## Decisions

- **D1 — Target layout**: `targets/<name>/{target.yaml, PRD.md, testplan.yaml, fixtures/}`. `target.yaml`: name, version, prdFile, prdSha256, testplanFile, conformanceSection (pointer used in the prompt), coldStartContract (setup/start script names), fixtures (commands the grader launches, env vars they export), coverageMode (`spec-checklist` | `attested`), attestation note.
- **D2 — Prompt template per target, candidates still uniform.** The shared base prompt becomes a template with target slots (PRD filename, conformance pointer, deliverables). Fairness rule is unchanged: within a run, every candidate gets the identical rendered prompt.
- **D3 — Coverage validation generalizes**: `spec-checklist` mode keeps the Symphony-style programmatic mapping (every declared REQUIRED item covered by ≥1 non-bonus step); `attested` mode (PRDs without a formal checklist) requires a signed-off coverage note in target.yaml and surfaces it in provenance.
- **D4 — Fixture contract**: fixtures declare named processes (`mock-tracker: bun fixtures/mock-linear.ts {port}`) that the grading runner starts/stops per trial and exposes to the evaluator via env vars — replacing today's hard-coded mock spawn in `grade-trial.ts`.
- **D5 — Migration is a move, not a rewrite**: Symphony files relocate under `targets/symphony-daemon/` with hashes unchanged; old run artifacts keep validating because provenance stores hashes, not paths.
- **D6 — `init --target`** scaffolds manifest + empty test plan from a provided spec file, runs an LLM-assisted test-plan draft as an optional step, and `validate --target` enforces schema, hash freshness, weight sanity, and coverage mode requirements before a target is runnable. (CLI surface is a flag on the existing `validate`/`init` commands, not a `target` subcommand group.)
- **D7 — Library targets adapt ViBench, not author fresh.** ViBench is Apache-2.0 (© 2026 Replit); its `prds/` specs and `tests/` plans are reusable with attribution. Adapting them (vs. writing new PRDs) is the cheaper path and reuses human-reviewed test plans. Adaptation work per target: convert `prd/*.txt` → `PRD.md`, port `tests/{artifact}/test*.txt` weighted steps → our `testplan.yaml` schema, build the fixtures our evaluator needs, then freeze+hash as usual.
- **D8 — Attribution is preserved per Apache-2.0.** Each adapted target records `source` provenance in `target.yaml` (`upstream: vibench-public`, repo URL, commit SHA, original app dir, license `Apache-2.0`). A top-level `targets/NOTICE` carries the ViBench copyright/NOTICE text. `validate --target` requires the `source` block's fields to be complete whenever `source.upstream` is present, and requires `targets/NOTICE` to exist.

## Risks / Trade-offs

- [Adapting three PRDs+plans is the real cost] → ship `symphony-daemon` migration first (zero new authoring), then adapt ViBench targets one at a time; each adapted target needs its own smoke trial before matrix use. Adapting (port `prd/*.txt` + reuse the human-reviewed `tests/*` plans) is markedly cheaper than authoring fresh, but porting the test plans into our schema and building fixtures is still real work.
- [Attribution drift on adapted specs] → `target.yaml` `source` block (repo/commit/dir/license) + `targets/NOTICE`; `validate --target` fails an adapted target missing its provenance, so attribution can't be dropped silently.
- [Test-plan quality varies for custom targets] → freeze+hash discipline, coverage attestation, and the no-repair evaluator rules apply uniformly; docs set expectations (weights, fatal gates, evidence-style checks).
- [Web-app target tempts toward a Playwright dependency] → out of scope here; REPL evaluator with HTTP assertions first.
- [Path churn breaking scripts/docs] → single PR with mechanical path updates; CLI keeps `--target symphony-daemon` as default so existing invocations behave identically.

## Open Questions

- Per-target budget defaults (a CLI tool needs far less than 2h/$50 per trial).

## References

### ViBench PRD catalog (source for library targets)

The library targets adapt specs from **ViBench** — Replit's PRD-based web-app benchmark — rather than authoring fresh. License was re-verified against the public repo: **Apache-2.0, Copyright 2026 Replit** (the earlier "CC-BY-NC-ND, not reusable" note was wrong). Apache-2.0 permits adaptation provided we preserve attribution and the `NOTICE` text; record provenance (source repo + commit) in each adapted `target.yaml` and carry a `NOTICE` entry in `targets/`.

- Repo: <https://github.com/ViBench/vibench-public>
- Single-artifact PRDs: <https://github.com/ViBench/vibench-public/tree/main/prds>
- Structure per app: `prd/{mvp,feature1,…}.txt` (incremental features) + `tests/{artifact}/test*.txt` — XML-ish weighted plans with per-step `<points>` and fatal/non-fatal gates. Maps cleanly onto our `PRD.md` + `testplan.yaml`; `mvp.txt` is the natural first cut, `featureN` are optional continuation targets.
- There is also a `prds-multiagent/` tree (multi-agent app specs: `PRD/mvp.txt` + `PRD/feature_*.txt`, flat `tests/test*.txt`) — out of scope for v1.

The 24 single-artifact PRDs, grouped by the harness target shape they best fit:

- **web-app** (browser/HTTP UI, the bulk): `barber`, `book_journey`, `collabrative_kaban`, `creative_community`, `family_friendly_venue`, `family_social`, `fleet_management`, `language_learning`, `market_place`, `notes`, `online_whiteboard`, `pilot_logbook`, `quiz`, `resume_builder`, `wedding`, `srm`
- **rest-api / service** (data + workflow, API-contract friendly): `energy_audit`, `furniture_freight`, `hvac`, `logistics`, `canary`
- **game / interactive logic** (turn/state engines): `mafia`, `monopoly`, `slack`

(Grouping is a starting suggestion, not a contract — final per-target shape is decided when each is adapted. `barber` is the smallest, fully-specced MVP and a good first non-Symphony smoke target for task 3.3/4.2.)

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
- **D6 — `target init`** scaffolds manifest + empty test plan from a provided spec file, runs an LLM-assisted test-plan draft as an optional step, and `target validate` enforces schema, hash freshness, weight sanity, and coverage mode requirements before a target is runnable.

## Risks / Trade-offs

- [Authoring three quality PRDs+plans is the real cost] → ship `symphony-daemon` migration first (zero new authoring), land library targets one at a time; each new target needs its own smoke trial before matrix use.
- [Test-plan quality varies for custom targets] → freeze+hash discipline, coverage attestation, and the no-repair evaluator rules apply uniformly; docs set expectations (weights, fatal gates, evidence-style checks).
- [Web-app target tempts toward a Playwright dependency] → out of scope here; REPL evaluator with HTTP assertions first.
- [Path churn breaking scripts/docs] → single PR with mechanical path updates; CLI keeps `--target symphony-daemon` as default so existing invocations behave identically.

## Open Questions

- Whether the three library PRDs are authored fresh or adapted from permissively licensed public specs (ViBench's PRDs are CC-BY-NC-ND — *not* reusable; default: author fresh).
- Per-target budget defaults (a CLI tool needs far less than 2h/$50 per trial).

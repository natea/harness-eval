# Proposal: Add PRD Library and Custom PRD Support

## Why

The eval is hard-wired to one PRD (the Symphony daemon spec). One product shape measures one slice of framework ability — ViBench's core finding is that results vary sharply by task type, and a daemon orchestrator says little about how frameworks handle a web app, CLI tool, or API service. A PRD library with per-PRD test plans, plus a documented path for users to bring their own spec, turns the harness from a single benchmark into a reusable evaluation instrument.

## What Changes

- Introduce an **eval-target abstraction**: a target = PRD document + frozen test plan + evaluation fixtures (mocks/stubs the evaluator needs) + target manifest (`target.yaml`: name, version, PRD hash, fixture entrypoints, cold-start contract). Targets live under `targets/<name>/`.
- Ship a starter library of typical software shapes, each with a spec-derived weighted test plan. Non-Symphony PRDs are adapted from the [ViBench PRD catalog](https://github.com/ViBench/vibench-public/tree/main/prds) (Apache-2.0, © 2026 Replit — reusable with attribution; see design.md References for the full list and target-shape mapping):
  - `symphony-daemon` — the existing Symphony spec, test plan, and mock Linear/stub app-server, migrated unchanged (current behavior becomes one target among several)
  - `web-app` — a small full-stack web application PRD (browser-driven evaluation, ViBench-style; e.g. `barber`, `quiz`, `notes`)
  - `cli-tool` — a CLI utility PRD (argument/exit-code/stdout contract checks)
  - `rest-api` — an HTTP API service PRD (endpoint contract + persistence checks; e.g. `logistics`, `hvac`)
- Add **bring-your-own-PRD**: `cli.ts init --target <name> --spec <file>` scaffolds a target from a user's spec document, validates the manifest, enforces the same freeze discipline (content hashes recorded per run; coverage validation where the PRD declares its own conformance checklist), and documents how to author a test plan with an LLM-assisted draft + human review step.
- Run config gains `--target <name>`; results/scorecards/provenance record the target and its hashes; cross-target scores are never aggregated (different test plans = different scales).
- Base task prompt template becomes target-parameterized (PRD filename, conformance section pointer, completion criteria) while remaining identical across candidates within a run.

## Capabilities

### New Capabilities

- `eval-targets`: Target abstraction — manifest schema, library layout, custom-target scaffolding/validation, freeze and provenance rules.

### Modified Capabilities

- `grading-rubric`: Test plan and evaluation fixtures resolve per target instead of the single hard-wired Symphony plan; coverage validation generalizes (spec-declared checklists where available, manual coverage attestation otherwise).
- `eval-orchestration`: Run matrix gains the target dimension (PRD content and prompt template loaded from the selected target); provenance records target name/version/hashes.

## Impact

- `config/testplan.yaml`, `prd/`, and `src/fixtures/` migrate into `targets/symphony-daemon/` (path changes in CLI, grading, docs).
- New target manifest schema in `src/types.ts`; `init --target`/`validate --target` CLI flags (on the existing commands, not a `target` subcommand group).
- Three library targets **adapted from ViBench** (Apache-2.0) — the bulk of the work: port each `prd/*.txt` → `PRD.md`, the upstream `tests/*` weighted plan → our `testplan.yaml`, and build the fixtures the evaluator needs; each gets the same freeze/coverage rigor as the Symphony plan. Adapting reuses human-reviewed plans (cheaper than authoring), but porting + fixtures is still real work.
- Attribution: each adapted `target.yaml` records a `source` provenance block (upstream repo, commit, original app dir, `Apache-2.0`); a `targets/NOTICE` preserves the ViBench copyright/NOTICE; `validate --target` enforces provenance presence.
- Reporting: target recorded everywhere; dashboard/leaderboard (separate change) groups by target.
- Existing GSD/cloud results remain valid as `symphony-daemon` target runs (hashes unchanged).

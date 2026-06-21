## Why

The shipped target library is small (`symphony-daemon`, `web-app`, `cli-tool`, `rest-api`) and the manifests carry no human-readable description of what each target actually builds — an operator selecting `--target` cannot tell, up front, what artifact (and how much real UI) to expect. This is exactly the surprise behind the artifact-preview stub problem: the `web-app` target is HTTP-light, so its conformant deliverable is a JSON API behind a placeholder page, not a browsable app — but nothing in the catalog says so before you run it. A richer, clearly-described catalog spanning more software shapes lets operators choose deliberately and makes cross-shape comparison of candidates possible.

## What Changes

- Adapt **~6 additional ViBench PRDs** (Apache-2.0) into runnable, frozen, **HTTP-light** targets spanning distinct software shapes. Candidate set (vetted for HTTP-observability during implementation; poor fits swapped): `notes`, `quiz`, `kanban` (`collabrative_kaban`), `marketplace` (`market_place`), `pilot-logbook`, `resume-builder`. Each ships a re-authored HTTP-observable weighted test plan, a coverage attestation, a frozen PRD hash, and complete upstream `source` provenance (with the existing `targets/NOTICE` preserved).
- Extend the **target manifest schema** with a structured, human-readable catalog description: a one-line `summary`, a longer `description` of what gets built and what is graded, and `tags` (domain, software `shape`, and an explicit `expectedUI` indicator of how much rendered UI a conformant build will actually have). These fields are the single source of truth.
- **Surface the description at selection time**: the CLI lists available targets with their `summary`/`shape`/`expectedUI`, and the Studio's target picker shows the description, so the "what will be built" answer is visible before a run.
- **Generate `docs/TARGETS.md`** from the manifests (not hand-written) so the catalog doc cannot drift from the frozen targets; add a `validate`/check path that fails if the generated doc is stale.
- Stay **HTTP-light (no browser automation)**, consistent with the v1 evaluator. Browser-graded UI conformance is an explicit non-goal/follow-up (see Impact).

## Capabilities

### New Capabilities
<!-- none — this extends existing eval-targets behavior -->

### Modified Capabilities
- `eval-targets`: the shipped library requirement expands beyond the four named targets to include the adapted ViBench catalog subset; the manifest definition gains required-on-read catalog metadata (`summary`, `description`, `tags`); and a new requirement covers a manifest-derived, drift-checked catalog document.
- `eval-studio`: the target selection surface SHALL display each target's catalog description (summary, shape, expected-UI) before a run is launched.

## Impact

- **Specs**: `openspec/specs/eval-targets/spec.md` (manifest definition, shipped-library, new catalog-doc requirement), `openspec/specs/eval-studio/spec.md` (target picker description).
- **Code**: `src/targets.ts` (`TargetManifest` schema + `scaffoldTarget` skeleton), `src/cli.ts` (target listing/`validate`), `src/studio/index.ts` + the Studio configure view (picker metadata), a new catalog-doc generator + check (CLI subcommand or script).
- **Data/targets**: ~6 new `targets/<name>/` directories (PRD.md, target.yaml, testplan.yaml), each frozen and attested; `targets/NOTICE` already covers ViBench attribution.
- **Existing targets**: the four shipped manifests gain the new (required) catalog fields — a mechanical, content-additive edit. Their PRD/test-plan hashes are unchanged (catalog metadata lives in `target.yaml`, which is not part of the PRD/test-plan freeze), preserving result comparability.
- **Non-goal (follow-up)**: a browser-graded UI-conformance target (Playwright) that would make `web-app`-style demos render a real app; called out so the stub-demo limitation is documented, not silently inherited.
- **Fairness invariant**: catalog metadata is descriptive only — it never enters the rendered base prompt, so candidates are unaffected.

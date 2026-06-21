## Context

The target library is governed by the `eval-targets` spec. A target is a frozen directory (`targets/<name>/`) with `PRD.md`, `target.yaml`, `testplan.yaml`; `src/targets.ts` validates the manifest (`TargetManifest` zod schema), enforces PRD-hash freshness, coverage-mode obligations, and upstream-provenance completeness. The four shipped targets (`symphony-daemon`, `web-app`, `cli-tool`, `rest-api`) already demonstrate the adaptation pattern: `web-app` is a ViBench `barber` PRD re-authored as HTTP-observable checks with a `source:` provenance block and the shared `targets/NOTICE`.

Two pains motivate this change: (1) the catalog is small and shape-narrow; (2) manifests carry no description of what a target builds, so operators only discover (e.g.) that `web-app` is HTTP-light — its conformant deliverable is a JSON API behind a placeholder page — after a run. ViBench publishes 24 browser-driven PRDs (Apache-2.0); the harness v1 evaluator is HTTP-light (no browser automation), so adaptation means re-authoring each PRD's browser flows as HTTP-observable, weighted, fatal-gated test-plan steps.

## Goals / Non-Goals

**Goals:**
- Add ~6 diverse, frozen, HTTP-light targets adapted from ViBench, each fully attested with complete provenance.
- Make "what will this build?" answerable before a run via structured manifest metadata, surfaced in the CLI and Studio.
- Ship a manifest-derived `docs/TARGETS.md` that cannot drift (generated + checked).
- Keep result comparability: existing PRD/test-plan freezes unchanged.

**Non-Goals:**
- Browser-graded UI conformance (Playwright). Explicit follow-up; called out so the stub-demo limitation is documented, not silently inherited.
- Adapting all 24 ViBench PRDs. A curated subset only.
- Changing the rendered base prompt or any fairness-relevant behavior.

## Decisions

**1. Catalog metadata lives in `target.yaml`, not `PRD.md`.**
Add `summary` (string), `description` (string), and `tags` (`{ domain, shape, expectedUI }`) to `TargetManifest`. Rationale: the PRD/test-plan freeze (content hashes) must stay stable for comparability, and `target.yaml` is *not* part of that freeze. So the four existing targets can gain catalog fields without re-freezing. `expectedUI` is an enum (`none | served-page | interactive`) so the picker and catalog can render it consistently and so it can later gate a `--design`/browser follow-up. Fields are **required on read** — `loadTarget` fails if absent — which forces every target (including bring-your-own) to self-describe. The `scaffoldTarget` skeleton gains commented placeholders + a TODO so new targets prompt for them.
- *Alternative considered:* a separate `catalog.yaml` or a sidecar registry. Rejected: splits the source of truth and invites drift; the manifest is already the per-target contract.

**2. `expectedUI` is descriptive, not enforced.**
It states what a *conformant* build will have given the test plan (e.g. `web-app` = `served-page`), not what the harness verifies. This is honest about HTTP-light grading and sets up the browser follow-up without over-promising now.

**3. Catalog doc is generated and drift-checked.**
A small generator (CLI subcommand `catalog` or `scripts/gen-catalog.ts`) reads all manifests and writes `docs/TARGETS.md`. `validate` (or a `--check` flag) regenerates in-memory and diffs against the committed file, failing on mismatch — same posture as the PRD-hash freeze. Rationale: a hand-written catalog drifts the moment a manifest changes; generation makes the manifest the single source of truth and CI-enforces it.
- *Alternative considered:* hand-written doc. Rejected per the user's "cannot drift" requirement.

**4. Adaptation recipe per ViBench PRD (mirrors `web-app`).**
For each selected PRD: (a) fetch the upstream PRD at a pinned commit; (b) reframe browser interactions as HTTP/JSON endpoints with a fixed seed date for clock-independence; (c) author a weighted `testplan.yaml` with a fatal cold-start gate (`S-1`) then one step per REQUIRED item, all HTTP-observable (status codes + JSON bodies); (d) write `target.yaml` with `coverageMode: attested`, a dated attestation mapping each REQUIRED item → step id(s), the `source:` provenance block (upstream, repo, pinned commit, originalDir, license), and the new catalog fields; (e) freeze the PRD hash; (f) `validate --target <name>`.
- *Candidate set (vet during implementation, swap poor HTTP fits):* `notes` (CRUD + search), `quiz` (stateful sessions + scoring), `kanban` (ordered collections + move ops), `marketplace` (multi-actor offers + state), `pilot-logbook` (validation + aggregation/totals), `resume-builder` (nested structured document + validation). Selection criterion: distinct software shape AND cleanly expressible as HTTP/JSON without DOM assertions.

**5. Surfacing.**
CLI: the target listing (and the `no target '<name>'` error's available-list, plus a `validate` summary) shows `name — summary [shape, expectedUI]`. Studio: the configure view's target picker shows `summary`, `shape`, `expectedUI` (per the eval-studio delta). Both read straight from the loaded manifest; no new data path.

## Risks / Trade-offs

- **HTTP-light adaptation loses UI semantics** → Accept and document via `expectedUI`; the browser-graded follow-up is the real fix. Pick PRDs whose value survives the HTTP reframing.
- **Attestation quality is human-gated** → Keep the per-REQUIRED→step mapping in each attestation (as `web-app` does) so coverage is auditable; `validate` enforces presence, a human enforces correctness.
- **Adding required manifest fields breaks the 4 existing targets until backfilled** → Backfill all four in the same change before flipping the schema to required; `validate` over the whole library is the gate.
- **Upstream PRD drift** → Pin `source.commit` per target (assert-only, like other pins); upstream movement never silently changes a frozen target.
- **Generator/check divergence across OSes (line endings)** → Normalize on write and compare normalized content.

## Migration Plan

1. Extend `TargetManifest` with optional fields; backfill catalog metadata into the 4 existing manifests; flip fields to required; `validate` all.
2. Adapt the curated ViBench subset one target at a time (recipe above), `validate` each.
3. Add the catalog generator + drift check; generate `docs/TARGETS.md`; wire the check into `validate`.
4. Surface metadata in CLI listing and the Studio picker.
Rollback: targets are additive directories; revert the schema-required flip and remove new target dirs. Existing run results are unaffected (no hash changes).

## Open Questions

- Final 6 — confirmed only after fetching and vetting each PRD for HTTP-observability; the spec requires "at least four" so the change can land with 4–6 if one or two prove poor fits.
- Catalog surface: CLI subcommand `catalog --check` vs. folding the check into `validate`. Lean: fold into `validate` (one gate), with a `catalog` generate command for writing.

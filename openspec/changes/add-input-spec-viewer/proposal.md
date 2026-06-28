# Add: Input-Spec Viewer (read the PRD a run was graded against)

## Why

The studio lets you inspect almost everything about a run *except the brief itself*.
You can see the generated artifacts (the `artifact-preview` capability — file tree,
live demo of the built app), the per-step check descriptions, the transcript, and
the scorecard. But there is **no way to read the actual PRD/SPEC that was fed to the
agents** — the input the whole run is judged against.

The data is already on disk and already loaded: each target carries
`targets/<name>/PRD.md` (the frozen PRD) and `targets/<name>/testplan.yaml`, and
`loadTarget()` exposes the full text as `prdContent` (file: src/targets.ts). The
studio simply never serves it — `resolveRunTarget` returns only the title and the
per-step checks (file: src/studio/index.ts), not the document.

`artifact-preview` is the *output* side ("what did the framework build?"). This is
its missing *input* counterpart ("what was it asked to build?"). Reading them
side-by-side is what makes a scorecard legible.

## What Changes

- **Serve the run's input spec.** A read-only endpoint resolves a run to its target
  by the recorded `prdSha256` (the same hash→target match `resolveRunTarget` already
  uses) and returns the PRD markdown + the test plan text. When a run's frozen
  `prdSha256` matches no current target (the PRD was re-frozen since), the response
  says so rather than serving a mismatched document.
- **A Spec panel in the run view.** The RunView gains a "Spec" disclosure rendering
  the PRD (and the test plan) the run was graded against, next to its scorecard —
  the same raw-markdown-in-`<pre>` treatment the transcript view already uses (no
  new markdown dependency).

## Out of scope

- Editing PRDs from the studio (PRDs are frozen on disk by deliberate process —
  the freeze invariant is unchanged; this is read-only).
- Reconstructing the exact historical PRD text for runs whose PRD was re-frozen
  (only the hash is archived per run, not the document) — those are flagged, not
  reconstructed.
- A diff between a run's frozen PRD and the current target version (a natural
  follow-up once mismatches are surfaced).

## Impact

- New capability: `input-spec-viewer`.
- Modified capability: `eval-studio` (the Spec panel).
- Reuses: src/targets.ts (`loadTarget().prdContent`, `plan`), the sha→target match
  in src/studio/index.ts. Read-only; no new runs, no grading change, freeze
  invariant preserved.

# Design: Input-Spec Viewer

## Context

A target on disk is `targets/<name>/{PRD.md, testplan.yaml, target.yaml}`.
`loadTarget(name)` returns the parsed manifest plus `prdContent` (the full PRD
text) and `plan` (the parsed test plan) (file: src/targets.ts). A run records only
its `prdSha256`, not the target name; the studio recovers the target by matching
that hash against every current target's PRD hash (file: src/studio/index.ts,
`targetBySha()` / `resolveRunTarget`). So the run→PRD path already exists — it just
stops at the title.

## Decisions

### 1. Resolve the input spec by the run's frozen hash

`GET /api/runs/:id/prd` resolves the run's `prdSha256` → target (the same
`targetBySha()` match `resolveRunTarget` uses) and returns:

```
{ name, title, prd: <PRD.md text>, testPlan: <testplan.yaml text>,
  sha, currentMatch: boolean }
```

`currentMatch` is true when the run's hash equals a current target's PRD hash —
i.e. the served document IS exactly what this run was graded against. When the hash
matches nothing (the PRD was re-frozen since the run), `currentMatch` is false and
`prd` is null with a note, because only the hash — not the document — is archived
per run. Serving the *current* PRD as if it were the run's would be a quiet lie, so
we don't.

### 2. Render where the scorecard already lives

The RunView gains a **"Spec" disclosure** (native `<details>`, no extra state)
beneath the target line, fetching `/api/runs/:id/prd` and rendering the PRD and the
test plan as raw markdown/YAML in `<pre className="whitespace-pre-wrap">` — the
exact treatment the transcript view already uses, so no markdown library is
introduced. A `currentMatch: false` response renders a warn badge instead of a
stale document.

### 3. Read-only, freeze-preserving

The endpoint only reads `loadTarget()` output and the on-disk test plan; it never
writes. PRDs remain frozen-by-process. This is the input mirror of
`artifact-preview`'s read-only output audit.

## Risks / trade-offs

- **Re-frozen PRDs can't show their exact historical text** — only the hash is
  archived per run. Surfacing `currentMatch: false` is the honest floor; a
  hash-addressed PRD archive (or a per-run PRD snapshot) would be needed to recover
  the exact text, and is deliberately out of scope.
- **Large PRDs in a `<pre>`** — acceptable for the current target sizes (a few KB);
  if PRDs grow, the disclosure stays collapsed by default so it never dominates the
  page.

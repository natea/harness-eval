# Eval Studio

A local web UI for **configuring** and **reviewing** harness-eval runs, built on
[shadcn/ui](https://ui.shadcn.com) with a dark theme derived from a single token
source-of-truth (`src/studio/DESIGN.md`). It supersedes the read-only dashboard
and is the front end the hosted-evals roadmap builds on.

```sh
bun run studio            # http://127.0.0.1:4871 (localhost-only)
bun run studio --port N
```

## Review

The leaderboard, run scorecards, and trial drill-downs — at parity with the
classic dashboard, on shadcn components — reusing the **same scoring module the
CLI uses**, so client-side re-weighting and composites are identical to
`report --weights`.

![Eval Studio review: leaderboard with re-weight sliders, dimension bars, and a
runs table](studio-review.png)

- **Leaderboard** — cross-run, aggregated by candidate/harness/worker-model, with
  re-weight sliders (live), dimension data bars, info-tooltips per column, and a
  mixed-candidate-set caveat.
- **Run scorecard** (`/runs/:id`) — per-candidate composite + dimensions + ±σ,
  the trials table, a step-comparison matrix (✅ / 🟡 partial-credit / ❌ with
  evidence on hover), exclusions, and provenance hashes.
- **Trial drill-down** (`/runs/:id/trials/:id`) — provenance + telemetry, the
  PRD-adherence step results with collapsible cited evidence, the blind judge's
  per-criterion samples + justifications, the real-integration tier, and notes.

## Configure

Build a run from the **live registries** (targets, frameworks, harness, model
profiles, providers). Validation **mirrors the CLI exactly** — the studio uses
the same `RunConfig.parse` + registry resolution, so a rejection in the studio is
a rejection on the command line (e.g. a framework with no section for the chosen
harness is unselectable, with the reason shown). It computes a budget envelope
and emits the **equivalent CLI command** to copy and run.

![Eval Studio configure: registry-driven selects, framework multi-select,
re-weight sliders, budget envelope, and the copyable CLI command](studio-configure.png)

> Launching runs directly from the studio (the run-launch endpoint + live
> runs/status view) is on the roadmap; today the studio produces the exact,
> validated command to run from your shell.

## Theming

The theme is a single mapping from `src/studio/DESIGN.md` (semantic color tokens,
typography, spacing, radius) into `src/studio/index.css` (`:root` CSS variables +
Tailwind v4 `@theme`), which shadcn components consume. Re-theming — or adopting a
`DESIGN.md` exported from a tool like Google Stitch or Claude Design — is a token
edit, not a component rewrite. Tailwind is processed by `bun-plugin-tailwind`
under `Bun.serve` (see `bunfig.toml`); no Vite.

# Proposal: Eval Studio — shadcn/ui Dashboard for Configuring and Reviewing Evals

## Why

The current dashboard (add-results-dashboard) is read-only review; runs are configured by CLI flags. As the harness/model/target axes become pluggable, run configuration becomes a combinatorial choice (which PRD target × which frameworks × which harnesses × which models) that deserves a real UI — and the hosted-evals roadmap (waiting list is already live on codingharness.xyz) needs a credible front end. shadcn/ui via its Claude Code skill + MCP server gives us accessible, theme-consistent components generated correctly against our stack instead of more hand-rolled CSS.

## What Changes

- **Eval Studio**: a new web UI (`src/studio/`) superseding the minimal dashboard, built with shadcn/ui components (Tailwind, dark theme matching codingharness.xyz):
  - **Configure view**: pick an eval target (PRD library + bring-your-own upload per eval-targets spec), multi-select frameworks from the candidate registry, select harness(es) and model profile(s) from their registries (one harness+model per run; multiple selections queue multiple runs), set trials/budgets/weights with validation mirrored from RunConfig — emitting either a queued local run or a copyable CLI command.
  - **Runs view**: live run list with status (building/grading/done), per-trial progress, capped/infra-failed badges.
  - **Review view**: everything the current dashboard does (leaderboard with re-weighting, run scorecards, trial drill-down with step evidence and judge samples, step-comparison matrix) rebuilt on shadcn primitives (Table, Card, Slider, Tooltip, Dialog, Tabs, Badge).
- **Run-launch API**: the studio server gains POST endpoints that enqueue runs through the existing orchestrator (local execution first; the hosted service later fronts the same API). Mutations are explicit and confirmation-gated — the read-only guarantee moves from "server has no writes" to "writes only via the launch endpoint, never touching artifacts".
- **Design tokens via `DESIGN.md`**: the studio's design system is captured in a single agent-friendly markdown file, `src/studio/DESIGN.md` (the portable, tool-agnostic format popularized by Google Stitch — semantic color tokens, typography, spacing scale, radius, shadows). It is the source-of-truth for the theme: its tokens map once into the Tailwind config + `:root`/`.dark` CSS variables that shadcn components already consume, so styling derives from the spec rather than ad-hoc CSS. `DESIGN.md` stays pure spec — it introduces no component implementation; shadcn remains the only component source. It can be hand-authored or generated/round-tripped by a `DESIGN.md`-speaking tool (Stitch today, Claude Design later) without changing the studio.
- **Tooling adoption**: install the shadcn skill (`bunx skills add shadcn/ui`) and MCP server for the implementing agent; components vendored via the shadcn CLI into the repo (no runtime registry dependency).
- The existing `bun run dashboard` remains until the studio reaches feature parity, then is retired by a follow-up.

## Capabilities

### New Capabilities

- `eval-studio`: Run configuration UI (target/framework/harness/model selection with registry-driven validation), run queue/status, and results review, served locally with the same artifact-honesty rules as reporting.

### Modified Capabilities

- `results-dashboard`: Review requirements (leaderboard, drill-down, re-weighting, schema gate) are restated as satisfied by the studio's Review view; read-only rule amended to scoped-writes (run launch only).

## Impact

- New deps: tailwindcss, shadcn/ui component sources (vendored), lucide icons; Bun HTML imports continue (no Vite) — verify shadcn CLI output works under Bun's bundler, else a minimal Tailwind build step.
- `src/studio/DESIGN.md` is the theme source-of-truth; the Tailwind theme + CSS-variable block are generated from it (one mapping step), so re-theming or adopting a `DESIGN.md`-exporting tool is a token edit, not a component rewrite.
- `src/studio/` (server + React app); run-launch endpoint wraps the orchestrator's existing entry points; registries (candidates/harnesses/models/targets) become the studio's option sources, keeping UI and CLI validation identical.
- Local-first: binds 127.0.0.1; the hosted service (separate change) will reuse the API surface with auth.
- Sequencing: depends on eval-targets (target list), benefits from harness/model registries as they land; review view can ship first against existing artifacts.

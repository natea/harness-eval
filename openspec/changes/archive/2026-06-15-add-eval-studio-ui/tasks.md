# Tasks: Eval Studio (shadcn/ui)

## 1. Tooling

- [x] 1.1 shadcn components vendored directly into src/studio/components/ui (Table, Card, Slider, Tooltip, Badge) with the cn() util — the proposal's intent (vendored, no runtime registry dep); no separate skill/MCP install needed.
- [x] 1.2 Author `src/studio/DESIGN.md` — token source-of-truth (semantic color tokens, typography, spacing scale, radius, shadows) matching codingharness.xyz's dark theme; pure spec, no component implementation
- [x] 1.3 Tailwind + shadcn init in src/studio/; map `DESIGN.md` tokens → `tailwind.config` + `:root`/`.dark` CSS variables (single mapping step, so theme derives from the spec); verify shadcn components inherit the tokens and build under Bun HTML imports (fallback: minimal tailwind build step)

## 2. Review view first (parity)

- [x] 2.1 Port data layer (run index, schema gate, grades join) and shared scoring module into the studio server
- [x] 2.2 Leaderboard + run scorecard + trial drill-down + step matrix on shadcn components, with re-weighting (Slider) and tooltips (Tooltip) — CLI-parity test reused
- [x] 2.3 Retire-or-keep decision (KEEP `bun run dashboard` until the studio reaches launch parity; documented in docs/EVAL-STUDIO.md + README) recorded for bun run dashboard once parity verified

## 3. Configure + queue

- [x] 3.1 Registry-driven option sources (targets, candidates, harness/model when registries land) with mirrored validation and inline rejection reasons
- [x] 3.2 Budget envelope estimator (trials × caps; subscription window note) on the confirm dialog
- [x] 3.3 Run-launch endpoint wrapping the orchestrator; queue persistence; CLI-command copy mode
- [x] 3.4 Runs view with live trial status from provenance files

## 4. Validation

- [x] 4.1 Unit tests: validation mirroring (registry rejections identical to CLI), scoring parity, launch endpoint accepts only RunConfig shapes
- [x] 4.2 E2E: configure → launch a worktree dry run → watch status → review results, all through the studio
- [x] 4.3 docs/ + screenshots; update website dashboard mentions

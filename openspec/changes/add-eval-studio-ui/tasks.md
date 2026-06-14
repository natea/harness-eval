# Tasks: Eval Studio (shadcn/ui)

## 1. Tooling

- [ ] 1.1 Install shadcn skill (`bunx skills add shadcn/ui`) and shadcn MCP server for the implementing agent; record versions
- [x] 1.2 Author `src/studio/DESIGN.md` — token source-of-truth (semantic color tokens, typography, spacing scale, radius, shadows) matching codingharness.xyz's dark theme; pure spec, no component implementation
- [x] 1.3 Tailwind + shadcn init in src/studio/; map `DESIGN.md` tokens → `tailwind.config` + `:root`/`.dark` CSS variables (single mapping step, so theme derives from the spec); verify shadcn components inherit the tokens and build under Bun HTML imports (fallback: minimal tailwind build step)

## 2. Review view first (parity)

- [ ] 2.1 Port data layer (run index, schema gate, grades join) and shared scoring module into the studio server
- [ ] 2.2 Leaderboard + run scorecard + trial drill-down + step matrix on shadcn components, with re-weighting (Slider) and tooltips (Tooltip) — CLI-parity test reused
- [ ] 2.3 Retire-or-keep decision recorded for bun run dashboard once parity verified

## 3. Configure + queue

- [ ] 3.1 Registry-driven option sources (targets, candidates, harness/model when registries land) with mirrored validation and inline rejection reasons
- [ ] 3.2 Budget envelope estimator (trials × caps; subscription window note) on the confirm dialog
- [ ] 3.3 Run-launch endpoint wrapping the orchestrator; queue persistence; CLI-command copy mode
- [ ] 3.4 Runs view with live trial status from provenance files

## 4. Validation

- [ ] 4.1 Unit tests: validation mirroring (registry rejections identical to CLI), scoring parity, launch endpoint accepts only RunConfig shapes
- [ ] 4.2 E2E: configure → launch a worktree dry run → watch status → review results, all through the studio
- [ ] 4.3 docs/ + screenshots; update website dashboard mentions

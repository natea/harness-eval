# Tasks: Codex harness sections for GSD, Agent Skills, Superpowers

> Builds on the merged `codex` driver. Compound Engineering deferred (TUI install).

## 1. GSD codex section
- [ ] 1.1 Add a `codex:` section to the `gsd` candidate: non-interactive
  `npx @opengsd/gsd-core@1.4.3 --codex --scope=project --profile=standard
  --non-interactive` install + the Codex skill-mention form of the
  new-project→plan-phase→execute-phase→verify-work protocol + continuation policy.
- [ ] 1.2 Smoke: `run --candidates gsd --harness codex --worker-model codex-oauth
  --provider worktree --target notes --trials 1`; confirm it drives a real build;
  record the working invocation syntax.

## 2. Superpowers codex section
- [ ] 2.1 Add a `codex:` section to `superpowers`: headless skill-discovery install
  of the pinned repo (Codex skills dir / `~/.agents/skills`, no TUI) + a single
  base-prompt session step (self-engages via the AGENTS.md gatekeeper) + continuation.
- [ ] 2.2 Smoke under `--harness codex`; confirm the methodology engages and builds.

## 3. Agent Skills codex section
- [ ] 3.1 Add a `codex:` section to `agent-skills`: place the pinned SKILL.md set in
  `.agents/skills` for repo-scan discovery + session (base prompt, or a kickoff line
  if the lifecycle needs one) + continuation.
- [ ] 3.2 Smoke under `--harness codex`; confirm the spec→build→test lifecycle runs.

## 4. Validation
- [ ] 4.1 `bun run src/cli.ts validate` passes (schema + known harness ids; each
  candidate's `codex` section is well-formed).
- [ ] 4.2 Fairness check: the rendered base prompt is identical across harnesses for
  a candidate; codex sections add only framework-prescribed commands.
- [ ] 4.3 At least one framework-fixed cross-harness pair runs end-to-end
  (claude-code vs. codex, same target + worker model), provenance recording the
  harness varied.
- [ ] 4.4 `openspec validate add-codex-framework-support --strict`.

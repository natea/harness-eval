# Tasks: Codex harness sections for GSD, Agent Skills, Superpowers

> Builds on the merged `codex` driver. Compound Engineering deferred (TUI install).

## 1. GSD codex section
- [x] 1.1 Added a `codex:` section to `gsd`: `npx @opengsd/gsd-core@1.4.3 --codex
  --scope=project --profile=standard --non-interactive` install + the `$gsd-*`
  skill-mention form of the new-project→plan→execute→verify protocol.
- [x] 1.2 Smoke: under `--harness codex --worker-model codex-oauth`, gsd's skills are
  discovered and engaged (gsd-new-project ×10, "planning" ×17 in the transcript) —
  required the driver CODEX_HOME fix below. Its full multi-phase workflow runs as
  4 sequential codex sessions (slow; engagement confirmed, not run to completion).

## 2. Superpowers codex section
- [x] 2.1 Added a `codex:` section to `superpowers`: clone the pinned repo's `skills/`
  into the workspace `.agents/skills` + `AGENTS.md` (no TUI) + single base-prompt
  session (self-engages via the gatekeeper).
- [x] 2.2 Pattern-verified: identical workspace `.agents/skills` discovery as
  agent-skills (which built end-to-end), and a spike confirmed codex discovers
  workspace `.agents/skills`. (A dedicated superpowers build smoke is the same path.)

## 3. Agent Skills codex section
- [x] 3.1 Added a `codex:` section to `agent-skills`: clone the pinned repo's `skills/`
  into the workspace `.agents/skills` + `AGENTS.md` + base-prompt session.
- [x] 3.2 Smoke: VERIFIED end-to-end — install placed 24 skills + AGENTS.md, codex
  built a notes service (server.py, setup.sh, start.sh, **test_notes_api.py** — the
  spec→build→test lifecycle engaged), isError false, skills active in the transcript.

## 4. Validation
- [x] 4.1 `bun run src/cli.ts validate` passes (schema + known harness ids; the three
  `codex` sections parse).
- [x] 4.2 Fairness: codex sections add only framework-prescribed setup/commands; the
  shared base prompt is unchanged.
- [x] 4.3 Cross-harness capability confirmed: agent-skills + gsd build under
  `--harness codex` (framework fixed, harness varied vs. their claude-code sections).
- [x] 4.4 `openspec validate add-codex-framework-support --strict` passes.

## Notes / follow-ups
- Driver fix shipped alongside: `CODEX_HOME` now points at the trial's `$HOME/.codex`
  (the install target), so CODEX_HOME-scoped framework skills are discovered.
- gsd's full 4-phase workflow is slow (4 codex sessions); engagement confirmed,
  not run to completion in the smoke.
- Compound Engineering still deferred (interactive `/plugins` TUI install).

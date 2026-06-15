# Tasks: Add Spec-Kit as a Candidate Framework

## 1. Registry entry

- [ ] 1.1 Add a `spec-kit` candidate to `config/registry.yaml` (claude-code
  harness) with `repo: https://github.com/github/spec-kit`, `pinnedVersion:
  v0.10.2`, and `markerPaths: [.specify/, specs/]`
- [ ] 1.2 Install steps: `uv tool install specify-cli --from
  git+https://github.com/github/spec-kit.git@v0.10.2`, then `specify init . --ai
  claude --force`, then assert the resolved CLI version (deterministic pin)
- [ ] 1.3 Session script (framework-prescribed wrappers only): `/speckit.constitution`,
  `/speckit.specify {{BASE_PROMPT}}`, `/speckit.plan`, `/speckit.tasks`,
  `/speckit.implement`; continuation allowlist generic + content-free

## 2. Sandbox image

- [ ] 2.1 Ensure the trial snapshot provides Python 3.11+, `uv`, and git
  (system-wide), so the install step is cold-start reproducible
- [ ] 2.2 Confirm `specify init` flags against `v0.10.2` (`--ai claude` and the
  in-place/`--force` behavior); record the exact commands

## 3. Validation

- [ ] 3.1 `bun run src/cli.ts validate` passes with the new candidate (schema +
  fairness: identical base prompt, pinned version, no task hints in the session)
- [ ] 3.2 Smoke: one real `spec-kit` trial on a UI/web target (worktree or docker)
  builds and grades; record adherence + speed/token cost vs an existing candidate
- [ ] 3.3 Re-pin discipline note: bumping `v0.10.2` is a deliberate version bump
  (same freeze rule as plugin pins)

# Tasks: Add Spec-Kitty as a Candidate Framework

## 1. Registry entry

- [ ] 1.1 Add a `spec-kitty` candidate to `config/registry.yaml` (claude-code
  harness) with `repo: https://github.com/Priivacy-ai/spec-kitty`,
  `pinnedVersion: v3.1.10`, and `markerPaths: [.kittify/]`
- [ ] 1.2 Install steps: install the pinned `spec-kitty` CLI, initialize a project
  (charter + Claude Code host commands into the workspace), and assert the
  resolved version (deterministic pin)
- [ ] 1.3 Session script (framework-prescribed wrappers only): establish charter →
  create a mission from `{{BASE_PROMPT}}` → drive `spec-kitty next --agent claude
  --mission <slug>` to completion; continuation allowlist generic + content-free

## 2. Confirm exact commands (docs)

- [ ] 2.1 From `https://docs.spec-kitty.ai` install guide: pin the exact installer
  command and the precise init/charter/mission/`next` command sequence for the
  Claude Code host; record them in the registry entry
- [ ] 2.2 Ensure the trial snapshot provides Spec-Kitty's runtime prerequisites so
  the install step is cold-start reproducible

## 3. Validation

- [ ] 3.1 `bun run src/cli.ts validate` passes with the new candidate (schema +
  fairness: identical base prompt, pinned version, no task hints in the session)
- [ ] 3.2 Smoke: one real `spec-kitty` trial on a UI/web target (worktree or
  docker) builds and grades; record adherence + speed/token cost vs an existing
  candidate
- [ ] 3.3 Re-pin discipline note: bumping `v3.1.10` is a deliberate version bump
  (same freeze rule as plugin pins)

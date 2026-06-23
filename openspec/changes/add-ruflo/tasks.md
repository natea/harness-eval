# Tasks: Add Ruflo as a Candidate Framework

## 1. Registry entry

- [ ] 1.1 Add a `ruflo` candidate to `config/registry.yaml` (claude-code harness)
  with `repo: https://github.com/ruvnet/ruflo`, `pinnedVersion: 3.14.0`, and
  `markerPaths: [.claude-flow/, .claude/, CLAUDE.md]`
- [ ] 1.2 Install steps (plugin Lite path): `claude plugin marketplace add
  ruvnet/ruflo` → `claude plugin install ruflo-core@ruflo` → assert the pinned
  version (deterministic pin)
- [ ] 1.3 Session script: Ruflo's prescribed orchestration slash commands with the
  shared base prompt injected once; continuation allowlist generic + content-free

## 2. Confirm exact commands (docs / v3.14.0)

- [ ] 2.1 Confirm the marketplace name + plugin slug for `ruflo-core@ruflo` and the
  exact `claude plugin list` version string at v3.14.0
- [ ] 2.2 Confirm the Lite plugin's slash-command set and the recommended
  spec-build sequence; record it in the registry entry

## 3. Fairness + isolation guards (gating)

- [ ] 3.1 Single-model: ensure Ruflo uses only the pinned worker model — no routing
  to other providers. Constrain or assert; mark single-model-only if needed
- [ ] 3.2 Isolation: confirm the Lite path runs entirely in the trial sandbox with
  no MCP server, no background daemons, and no federation reaching outside it
- [ ] 3.3 No cross-trial state: confirm no persistent memory / self-learning is
  carried between trials (fresh sandbox + no external store)

## 4. Validation

- [ ] 4.1 `bun run src/cli.ts validate` passes with the new candidate (schema +
  fairness: identical base prompt, pinned version, no task hints in the session)
- [ ] 4.2 Smoke: one real `ruflo` trial on a target (worktree or docker) builds and
  grades; **verify telemetry shows only the worker model** (no off-model calls)
  and no external/federation activity; record adherence + speed/token cost
- [ ] 4.3 Re-pin discipline note: bumping `3.14.0` is a deliberate version bump
  (same freeze rule as the other plugin pins)

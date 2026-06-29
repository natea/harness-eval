# Tasks: Add gstack as a Candidate Framework

## 1. Registry entry

- [ ] 1.1 Add a `gstack` candidate to `config/registry.yaml` (claude-code harness)
  with `repo: https://github.com/garrytan/gstack`, `pinnedVersion: <commit-sha>`
  (no tags; `VERSION` 1.58.5.0), and `markerPaths: [.claude/skills/gstack/,
  CLAUDE.md, AGENTS.md]`
- [ ] 1.2 Install steps: shallow clone into the trial skills dir + checkout the
  pinned SHA + run `./setup`, then write the CLAUDE.md "use gstack" note (no task
  hints); assert the pin (assert-only — clone is pinned by SHA)
- [ ] 1.3 Session script: `/autoplan` (or `/office-hours` → `/autoplan`) → implement
  → `/review` with `{{BASE_PROMPT}}` injected once. EXCLUDE `/ship`,
  `/land-and-deploy`, `/canary`. Continuation allowlist generic + content-free

## 2. Confirm exact commands (repo @ pinned SHA)

- [ ] 2.1 Confirm the clone+`./setup` install actually provisions the skills and the
  exact slash-command names at the pinned SHA (`/autoplan`, `/review`, …)
- [ ] 2.2 Record the recommended graded-build sequence in the registry entry;
  confirm `./setup` needs no interactive input and no external services

## 3. Fairness + isolation guards (gating)

- [ ] 3.1 Single-model: confirm gstack uses only the pinned worker model — no
  routing to other providers (sandbox has no other-provider creds; verify in 4.2)
- [ ] 3.2 No external reach: ensure browser (`/browse`, `connect-chrome`) and deploy
  (`/ship`, `/setup-deploy`) are NOT exercised; network-isolate where the provider
  allows; the smoke watches for Chrome/external/deploy activity
- [ ] 3.3 No cross-trial state: keep gbrain off (do not `/setup-gbrain`); confirm no
  external brain store; fresh sandbox per trial carries nothing over

## 4. Validation

- [ ] 4.1 `bun run src/cli.ts validate` passes with the new candidate (schema +
  fairness: identical base prompt, pinned version, no task hints in the session)
- [ ] 4.2 Smoke: one real `gstack` trial on a light target (worktree) builds and
  grades; **verify telemetry shows only the worker model** and no external/browser/
  deploy/brain activity; record adherence + speed/token cost
- [ ] 4.3 Re-pin discipline note: bumping the pinned SHA is a deliberate version bump
  (same freeze rule as the other commit-pinned candidates)

# Tasks: Add gstack as a Candidate Framework

## 1. Registry entry

- [x] 1.1 Add a `gstack` candidate to `config/registry.yaml` (claude-code harness)
  with `repo: https://github.com/garrytan/gstack`, `pinnedVersion: <commit-sha>`
  (no tags; `VERSION` 1.58.5.0), and `markerPaths: [.claude/skills/gstack/,
  CLAUDE.md, AGENTS.md]`
- [x] 1.2 Install steps: shallow clone into the trial skills dir + checkout the
  pinned SHA + run `./setup`, then write the CLAUDE.md "use gstack" note (no task
  hints); assert the pin (assert-only — clone is pinned by SHA)
- [x] 1.3 Session script: `/autoplan` (or `/office-hours` → `/autoplan`) → implement
  → `/review` with `{{BASE_PROMPT}}` injected once. EXCLUDE `/ship`,
  `/land-and-deploy`, `/canary`. Continuation allowlist generic + content-free

## 2. Confirm exact commands (repo @ pinned SHA)

- [x] 2.1 Confirm the clone+`./setup` install actually provisions the skills and the
  exact slash-command names at the pinned SHA (`/autoplan`, `/review`, …)
- [x] 2.2 Record the recommended graded-build sequence in the registry entry;
  confirm `./setup` needs no interactive input and no external services

## 3. Fairness + isolation guards (gating)

- [x] 3.1 Single-model: CONFIRMED — smoke transcript shows only `claude-opus-4-6`,
  no routing to other providers (sandbox has no other-provider creds)
- [x] 3.2 No external reach: CONFIRMED — session excluded `/ship`/`/browse`/deploy;
  no Chrome/external/deploy activity in the smoke build
- [x] 3.3 No cross-trial state: CONFIRMED — gbrain left off (no `/setup-gbrain`); the
  skills install is sandbox-local, fresh per trial, nothing carried over

## 4. Validation

- [x] 4.1 `bun run src/cli.ts validate` passes with the new candidate (schema +
  fairness: identical base prompt, pinned version, no task hints in the session)
- [x] 4.2 Smoke DONE on rest-api: build survived, graded post-hoc — adherence 77,
  quality 36, single-model verified (only claude-opus-4-6), no external/browser/
  deploy/brain activity
- [x] 4.3 Re-pin discipline note: bumping the pinned SHA is a deliberate version bump
  (same freeze rule as the other commit-pinned candidates)

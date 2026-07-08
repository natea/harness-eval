# Design: Add gstack

## Context

Candidates are declared in `config/registry.yaml` with per-harness `install`,
`session`, and `continuation` blocks, a `pinnedVersion`, and `markerPaths` for the
blind-judge scrubber (candidate-registry spec). gstack is a Bun/TypeScript
Claude Code "setup": 23 role slash commands installed as a **skills-dir clone**
(`~/.claude/skills/gstack` + `./setup`), not a plugin marketplace, with no release
tags (pin by commit; `VERSION` = `1.58.5.0`). Same install class as Agent Skills'
skills-dir path. The Ruflo apply taught the lesson encoded here: verify the
framework's actual capabilities against the fairness invariants before trusting a
"lite" assumption.

## Decisions

### 1. Install — skills-dir clone, commit-pinned

Per gstack's own instructions: shallow-clone the repo into the trial's skills dir
and run its `./setup`, checked out at a **pinned SHA** (assert-only, the same
discipline as the other git-source candidates). Then write the CLAUDE.md "use
gstack" note the framework expects — adapted to the sandbox, free of task hints.
markerPaths cover what the scrubber must strip so the quality judge stays blind:
`.claude/skills/gstack/`, `CLAUDE.md`, `AGENTS.md`.

### 2. Session — plan/build/review, never ship

gstack's documented end-to-end flow is `/autoplan` → implement → `/ship`. For a
**graded build** we want the build, not a deploy, so the session is `/autoplan` (or
`/office-hours` then `/autoplan`) → implement → `/review`, with `{{BASE_PROMPT}}`
injected once. `/ship`, `/land-and-deploy`, `/canary` are excluded — they push
externally and have no place in an isolated trial.

### 3. Fairness scope — constrain the heavyweight capabilities

gstack, like Ruflo, is more than prompts. The gates:
- **Single-model:** the sandbox carries only the worker-model credential, so gstack
  can't route off-model; the smoke confirms via telemetry.
- **No external reach:** browser (`/browse`/`connect-chrome`) and deploy
  (`/ship`/`/setup-deploy`) must not be exercised — excluded from the session and,
  where the sandbox allows, network-isolated. The smoke watches for external/Chrome
  activity.
- **No cross-trial state:** gbrain is opt-in and stays off; the fresh per-trial
  sandbox means no carry-over. No external brain store is configured.

### 4. Validate, then smoke

`bun run src/cli.ts validate` checks schema + fairness (identical base prompt,
pinned version, no task hints). One real `gstack` trial on a light target then
confirms: it builds and grades, telemetry shows only the worker model, and there's
no external/browser/deploy/brain activity — exactly the Ruflo smoke shape.

## Risks / trade-offs

- **Heavyweight setup** — `./setup` + 23 tools may be slow or spawn helpers; the
  trial wall-clock cap bounds it, and the smoke surfaces resource/leak issues.
- **Capability creep** — a future gstack version could wire browser/deploy/brain
  into the default flow; the pin + smoke are the guard, and the pin is re-bumped
  deliberately (freeze discipline).
- **Hollow-vs-fair tension** — excluding ship/browser/brain keeps it fair but may
  trim gstack's edges; that's the right trade for a comparable build eval, and is
  recorded so the comparison is honest.

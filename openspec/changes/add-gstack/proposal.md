# Add: gstack as a Candidate Framework

## Why

The bracket and the leaderboard want a wider, more varied field of frameworks.
gstack ([garrytan/gstack](https://github.com/garrytan/gstack)) — "Garry Tan's
exact Claude Code setup" — is a strong addition: **23 opinionated, role-based
slash commands** (CEO, Designer, Eng Manager, Release Manager, Doc Engineer, QA)
that drive a full plan→build→review→ship workflow. It's a different shape from the
current field (Superpowers skills, GSD planning, Agent Skills SDLC, Compound
Engineering methodology, and the Ruflo MCP swarm), so it broadens what the eval
covers.

It also installs cleanly for our harness: a **skills-dir clone** (no plugin
marketplace), pinnable by commit, on the `claude-code` harness — the same class of
install as Agent Skills' skills-dir path.

## What Changes

- **Add a `gstack` candidate** to `config/registry.yaml` on the `claude-code`
  harness. Install is a shallow clone into the trial's skills dir + its `./setup`,
  pinned to a commit (no release tags; `VERSION` is `1.58.5.0`).
  - **Install:** `git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git <skills>/gstack && (cd <skills>/gstack && ./setup)`, checked out at a pinned SHA, then a CLAUDE.md note that loads gstack — adapted to the trial sandbox, no task hints.
  - **Session:** gstack's prescribed build flow — `/autoplan` → implement → `/review`
    — with the shared base prompt injected once. **Deliberately not** `/ship` /
    `/land-and-deploy` (those deploy externally; out of scope for a graded build).
- **Fairness + isolation gating (the crux, learned from Ruflo):** gstack ships
  capabilities that touch the eval's invariants and MUST be constrained:
  - **Browser** (`/browse`, `/connect-chrome`, `chrome-cdp`) — external reach.
  - **Deploy** (`/ship`, `/land-and-deploy`, `/canary`, `/setup-deploy`) — external.
  - **gbrain** (`gstack-brain-*`, `/setup-gbrain`) — a memory/store that, if external
    or shared, would be cross-trial state. It is opt-in (`/setup-gbrain`); keep it
    off.
  The single-model, fresh-sandbox-per-trial, no-external-store invariants must hold;
  the validation smoke confirms telemetry stays on the worker model with no external
  reach.

## Out of scope (until validated)

- The `codex` harness path (gstack has a `/codex` command + `codex/` dir) — a
  follow-on once the claude-code path is fair and green.
- Enabling gbrain, browser, or deploy inside the eval.

## Impact

- Modified capability: `candidate-registry` (one new entry + its fairness scope).
- Touches `config/registry.yaml`; reuses the existing claude-code driver, freeze,
  and blind-judge scrub (markerPaths). No grading change. Adding gstack to a target
  is **real spend** (one build + grade per trial).

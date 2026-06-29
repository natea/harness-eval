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

- [x] 2.1 Confirmed at v3.14.0: repo `ruvnet/ruflo` exists; tag `v3.14.0` is real
  (latest v3.14.4). Marketplace name `ruflo`; plugin `ruflo-core` →
  `claude plugin install ruflo-core@ruflo`. NOTE: `marketplace add ruvnet/ruflo`
  pulls HEAD, not the tag (assert-only pin gotcha); ruflo-core's plugin.json
  version is `0.2.2`, so the version assert must target that, not the repo tag.
- [x] 2.2 Confirmed ruflo-core's command set: only `/ruflo-status` and `/witness`
  (observability) — there is NO spec-build orchestration command in ruflo-core.
  The build commands live in OTHER plugins (ruflo-swarm, ruflo-autopilot). So a
  Lite session is just the base prompt; ruflo's value is its MCP toolset, not slash
  commands.

## 3. Fairness + isolation guards (gating) — **BLOCKED, see finding**

> **Finding (blocker).** ruflo-core v3.14.0 is NOT the "slash-commands-only, no-MCP
> Lite path" this change assumed. Its plugin.json: *"registers the ruflo MCP server
> (300+ tools across memory/agentdb/embeddings/hooks/aidefence/neural/autopilot/
> browser/agent/swarm), 3 generalist agents, 3 skills"* — it ships `.mcp.json` and
> `hooks/`. So:

- [ ] 3.1 Single-model — UNVERIFIED. ruflo advertises `neural`/multi-provider; the
  sandbox lacks other-provider creds (so it likely can't route off-model), but this
  needs telemetry confirmation in a real trial (4.2).
- [ ] 3.2 Isolation — **FAILS as specified.** ruflo-core registers an MCP server
  (memory/browser/swarm/neural) + hooks. The spec's "no MCP server" cannot hold for
  ruflo-core at v3.14.0. Either (a) accept MCP-in-sandbox as ruflo's framework kit
  (re-scope this gate), or (b) install with the MCP server disabled (a tool-stripped
  ruflo that may be hollow — its value IS the MCP tools).
- [ ] 3.3 No cross-trial state — likely OK via fresh-sandbox-per-trial (memory store
  is sandbox-local, empty each trial) PROVIDED no external store; confirm in 4.2.

## 4. Validation

- [ ] 4.1 `bun run src/cli.ts validate` passes with the new candidate (schema +
  fairness: identical base prompt, pinned version, no task hints in the session)
- [ ] 4.2 Smoke: one real `ruflo` trial on a target (worktree or docker) builds and
  grades; **verify telemetry shows only the worker model** (no off-model calls)
  and no external/federation activity; record adherence + speed/token cost
- [ ] 4.3 Re-pin discipline note: bumping `3.14.0` is a deliberate version bump
  (same freeze rule as the other plugin pins)

# Design: Add Ruflo as a Candidate Framework

## Context

Ruflo ships three install paths: a **Claude Code plugin (Lite)** —
`/plugin install ruflo-core@ruflo`, slash commands only; a **full CLI** —
`npx ruflo@latest init wizard` (writes `.claude/`, `.claude-flow/`, `CLAUDE.md`,
27 hooks, 12 background workers); and an **MCP server** —
`claude mcp add ruflo -- npx ruflo@latest mcp start` (~210 MCP tools, AgentDB
vector memory, SONA self-learning, cross-machine federation). TypeScript/npm,
latest **v3.14.0**, MIT.

The existing candidates are Claude Code plugins installed with
`claude plugin marketplace add` + `claude plugin install` + a version assert.
Ruflo's Lite path fits that exact shape.

## Decisions

### 1. Register the plugin (Lite) path, not the full swarm

The full CLI/MCP mode is powerful but hostile to the eval's invariants:

| Ruflo full-mode feature | Conflict with the harness |
| --- | --- |
| 5-provider intelligent routing | Breaks the fixed single worker model |
| AgentDB persistent memory / SONA self-learning | Cross-trial contamination (a later trial benefits from earlier) |
| Cross-machine **federation** | Breaks per-trial sandbox isolation; reaches outside the sandbox |
| 12 background workers + MCP daemon | Long-lived processes hold the exec stream; unbounded cost/time |

The **plugin Lite path** is the isolation-safe subset: slash commands run inside
the trial sandbox, no MCP server, no background daemons, no federation. So we
register Lite *because* it respects the invariants, and defer full-mode swarms to
a separate change that must first prove single-model + isolation.

### 2. Install + pin (matches the other plugin candidates)

```
claude plugin marketplace add ruvnet/ruflo
claude plugin install ruflo-core@ruflo
claude plugin list | grep -A1 'ruflo' | grep -q 'Version: 3.14.0'
```

The exact marketplace name and plugin slug (`ruflo-core@ruflo`) are confirmed
against v3.14.0 during implementation; the **version assert** is the invariant —
upstream drift fails the trial deterministically, re-pin deliberately.

### 3. Session script: Ruflo's orchestration commands, base prompt injected once

The shared base prompt is the only task content; Ruflo's prescribed slash commands
wrap it (the exact command sequence is confirmed against the plugin's command set
in implementation, like Spec-Kitty's). No task hints beyond the rendered prompt.

### 4. Single-model + isolation guards

- **Single model:** ensure Ruflo uses only the pinned worker model. If the Lite
  plugin exposes provider routing, it must be constrained to the worker model (or
  the candidate is marked single-model-only); a smoke trial verifies no
  off-model calls appear in telemetry.
- **Isolation:** the fresh per-trial sandbox already prevents cross-trial state;
  the registration must additionally ensure no federation / external memory is
  reachable (Lite has none). Marker paths `.claude-flow/`, `.claude/`, `CLAUDE.md`
  are scrubbed before blind judging.

## Risks / Trade-offs

- **Lite ≠ Ruflo's headline power.** Evaluating the plugin form understates the
  full swarm. That's the honest, fair comparison for now; full-mode is a scoped
  follow-on, not silently folded in.
- **Provider routing leak.** If the Lite plugin still routes off-model, fairness
  breaks — the smoke trial must confirm single-model before this is run-eligible.
- **Install-slug drift across versions.** Pinning v3.14.0 + asserting the version
  makes it deterministic; re-pinning is a deliberate, reviewed bump.

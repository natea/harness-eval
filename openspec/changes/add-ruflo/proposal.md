# Proposal: Add Ruflo as a Candidate Framework

## Why

The current field — Superpowers (skills), Compound Engineering (methodology),
Agent Skills (SDLC pack), GSD (spec-driven planning) — is all "single-agent,
structured-workflow" in flavor. [**Ruflo**](https://github.com/ruvnet/ruflo)
(`ruvnet/ruflo`, MIT) is a different category worth measuring: an **agent
meta-harness** that wraps Claude Code with multi-agent **swarms**, task routing,
and orchestration hooks. Adding it tests whether heavyweight orchestration
actually beats a focused single agent on the same frozen specs — exactly the kind
of question the leaderboard exists to settle.

Ruflo is also the first candidate that *could break several harness invariants* if
added naively, which makes registering it carefully valuable in its own right.

## What Changes

- Add a **`ruflo`** candidate to `config/registry.yaml` on the `claude-code`
  harness, installed via Ruflo's **plugin (Lite) path** — slash commands only, no
  MCP server — pinned at **v3.14.0**:
  - **Install:** `claude plugin marketplace add ruvnet/ruflo` →
    `claude plugin install ruflo-core@ruflo` → assert the pinned version (same
    discipline as the other plugin candidates). The exact marketplace/plugin slugs
    are confirmed against v3.14.0 in implementation.
  - **Session:** Ruflo's prescribed orchestration slash commands, with the shared
    base prompt injected once — confirmed against the plugin's command set.
  - **Marker paths** (scrubbed before blind judging): `.claude-flow/`, `.claude/`,
    `CLAUDE.md`.

- **Why the Lite/plugin path, not the full CLI/MCP swarm.** Ruflo's full mode adds
  an MCP server, ~210 MCP tools, 12 background workers, persistent vector memory
  (AgentDB), self-learning (SONA), and **cross-machine federation**. Those
  directly threaten the eval's invariants, so the plugin Lite path is chosen
  because it is the **isolation-safe** subset (slash commands in the sandbox, no
  MCP, no background daemons, no federation).

- **Fairness guards (the crux):**
  1. **Single worker model.** Ruflo routes across 5 providers; the eval fixes one
     worker model. Ruflo must use *only* the pinned worker model — no routing to
     GPT/Gemini/Ollama — or "same model" fairness is void.
  2. **Per-trial isolation.** No cross-trial memory, no self-learning carried
     between trials, no federation out of the sandbox. Each trial is a fresh
     sandbox already; the registration must ensure Ruflo doesn't reach external
     state or persist across runs.

## Out of scope

The full CLI/MCP swarm mode (MCP server, federation, persistent cross-run memory)
— a possible later change once its isolation + single-model story is proven. This
change registers the comparable, sandbox-safe plugin form.

## Impact

- Affected spec: `candidate-registry` (the Ruflo candidate + a meta-harness
  fairness requirement: single-model, per-trial isolation, no federation).
- Affected config: `config/registry.yaml`.
- Fairness preserved: identical rendered base prompt; only Ruflo's prescribed
  command wrappers added; graded on the same frozen targets/test plans as every
  other candidate.

# Proposal: Codex harness sections for GSD, Agent Skills, Superpowers

> Builds on **`harness-drivers`** (the `codex` driver, merged via add-codex-cli-harness)
> and the candidate-registry's per-harness sections (the spec already reserves
> `codex` as a "later" harness id).

## Why

Today every framework candidate (Superpowers, Compound Engineering, Agent Skills,
GSD) only ships a `claude-code` harness section, so they can only be compared on
Claude Code. The `codex` driver now exists, and research confirms three of the four
frameworks run **headlessly under Codex**:

- **GSD** (`open-gsd/gsd-core`) — multi-runtime installer; non-interactive
  `npx @opengsd/gsd-core --codex` writes Codex-native skills.
- **Superpowers** (`obra/superpowers`) — platform-agnostic SKILL.md files; Codex
  discovers them natively (`~/.agents/skills`), the methodology self-engages via the
  AGENTS.md gatekeeper (no TUI).
- **Agent Skills** (`addyosmani/agent-skills`) — plain SKILL.md auto-discovered by
  Codex's repo scan of `.agents/skills`.

Adding a `codex` section to each lets a run hold the **framework fixed** and vary the
**harness** (Claude Code vs. Codex) — a comparison we can't make today.

**Compound Engineering is deliberately out of scope:** its Codex install requires an
interactive `/plugins` TUI step (Codex's CLI has no plugin-install subcommand) plus a
Bun agent step, which can't run in a headless trial. Deferred until Codex's native
plugin spec covers custom agents.

## What Changes

- **Add a `codex:` harness section** to the `gsd`, `superpowers`, and `agent-skills`
  candidates in `config/registry.yaml`, each with the framework's Codex-native,
  non-interactive install and its session protocol (Codex skill-mention/auto-engage
  form, not Claude slash commands).
- **Smoke each** Codex section end-to-end before relying on it (a build trial under
  `--harness codex`), exactly the per-addition discipline used for the bare
  `codex-baseline` candidate.
- **Fairness unchanged:** the shared base prompt and worker-model-fixed rules still
  hold; the codex sections add only each framework's own prescribed commands.

## Capabilities

### Modified Capabilities

- `candidate-registry`: realizes the reserved `codex` harness id — the shipped
  candidates GSD, Superpowers, and Agent Skills gain a working `codex` section
  (Compound Engineering's Codex section is deferred, with a recorded reason).

## Impact

- **Config:** `config/registry.yaml` gains a `codex:` section for `gsd`,
  `superpowers`, `agent-skills` (install + session + continuation).
- **Validation:** `validate` (schema + known harness id) passes; a Codex smoke per
  framework confirms the install/session actually drive a build (real spend).
- **Provenance:** runs record `harness: codex` + the candidate, enabling
  framework-fixed cross-harness comparisons.
- **Out of scope:** Compound Engineering on Codex (TUI install); changing
  orchestration/grading (per-harness sections need no engine change).

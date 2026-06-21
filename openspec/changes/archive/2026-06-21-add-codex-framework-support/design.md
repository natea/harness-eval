## Context

Candidates declare per-harness `install` + `session` + `continuation` in
`config/registry.yaml`; today only `claude-code` sections exist. The `codex` driver
is merged. Research (per-framework Codex docs) shows GSD, Superpowers, and Agent
Skills install headlessly under Codex, but each uses a different mechanism and a
different invocation form than Claude slash commands.

## Goals / Non-Goals

**Goals:** working, headless `codex` sections for GSD, Superpowers, Agent Skills;
fairness preserved; each smoke-verified.

**Non-Goals:** Compound Engineering on Codex (TUI install); any orchestration/grading
change; compressing or otherwise altering the shared base prompt.

## Decisions

**1. Per-framework Codex install/session (from upstream docs; verify at impl).**
- **GSD:** non-interactive `npx --yes @opengsd/gsd-core@<pin> --codex --scope=project
  --profile=standard --non-interactive` (per-runtime flag, not `--runtime=`). GSD
  rewrites its commands to Codex skill mentions, so the session uses the
  `$gsd-*`/skill-mention form of the same protocol (`new-project → plan-phase →
  execute-phase → verify-work`). Confirm the exact mention syntax in the smoke.
- **Superpowers:** Codex discovers SKILL.md natively; the methodology self-engages
  via the AGENTS.md gatekeeper, so the session is a single base-prompt step (as in
  its claude-code section). Install = the headless skill-discovery path (clone the
  pinned repo into the Codex skills dir / `~/.agents/skills`), NOT a plugin-marketplace
  TUI install. Confirm the exact install command in the smoke.
- **Agent Skills:** plain SKILL.md auto-discovered from `.agents/skills`; install =
  place the pinned skills there; session = base prompt (the `using-agent-skills`
  meta-skill gatekeeps the lifecycle). Confirm whether the full spec→build→test
  lifecycle auto-runs or needs a kickoff line.

**2. Smoke-gate each section.** The exact install/session strings are derived from
docs; each section is marked provisional until a `--harness codex` build trial
confirms it drives a real build (same discipline as `codex-baseline`).

**3. Fairness unchanged.** Codex sections add only each framework's own prescribed
commands; the shared base prompt and worker-model-fixed rules are untouched.

## Risks / Trade-offs

- **Install/session strings wrong** → smoke each before matrix use; a failed smoke
  fixes the section, never the engine.
- **Codex CLI has no headless plugin-install** → use skill-discovery/CLI-flag install
  paths only; this is exactly why Compound Engineering is deferred.
- **Invocation-form drift (slash vs. skill-mention)** → confirm per framework in the
  smoke; record the working form in the registry.

## Open Questions

- Exact Codex skill-mention syntax GSD expects for multi-step phases.
- Superpowers' precise headless install command for the Codex skills dir at a pin.
- Whether Agent Skills' full lifecycle auto-engages under Codex or needs a kickoff.

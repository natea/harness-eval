# Design: Add Spec-Kitty as a Candidate Framework

## Context

Spec-Kitty is a CLI harness (`spec-kitty next --agent <name> --mission <slug>`)
that runs **missions** against an AI host (Claude Code, Codex, OpenCode, Cursor,
Gemini, …) under a **charter** (`.kittify/charter/charter.md`), keeping specs,
plans, and work packages aligned with review evidence ("governed context
injection"). Like Spec-Kit it bootstraps host commands into the project rather
than installing as a Claude Code plugin, so the existing candidate-registry schema
(arbitrary install shell + a command-driven session) fits without change.

The public docs page enumerates the model (charter, missions, the `next` loop)
but not every install/command detail, so this design fixes the **shape** and
defers the **exact tokens** to an implementation task that reads the install guide
at `https://docs.spec-kitty.ai`.

## Decisions

### Install: pinned CLI + project init

Install the `spec-kitty` CLI pinned at `v3.1.10`, then initialize a project so the
Claude Code host commands and `.kittify/charter/charter.md` are written into the
trial workspace, then assert the resolved version (deterministic pin, same
discipline as plugin candidates). The exact installer (the macOS/other install
guide) and init invocation are confirmed in task 2 — pinning + asserting the
version is the invariant; the precise command is the detail.

### Session script: charter → mission → next-loop

The shared base prompt is injected once, as the mission definition:

1. Establish/accept the **charter** (governing constitution).
2. Create a **mission** from `{{BASE_PROMPT}}` (the identical rendered target
   prompt every candidate receives).
3. Drive the mission to completion via the `spec-kitty next --agent claude
   --mission <slug>` loop (with the generic, content-free continuation allowlist).

These are Spec-Kitty's prescribed wrappers — the only additions allowed by the
fairness rules. The exact command/slash-command names are pinned in task 2.

### Marker scrubbing

`.kittify/` is Spec-Kitty's fingerprint and is added to `markerPaths` so the blind
code-quality judge cannot identify the framework from the artifact.

## Risks / Trade-offs

- **Under-documented exact commands** — mitigated by deferring exact tokens to a
  confirmation task while pinning the version and integration shape now; the smoke
  trial validates the real commands before the change archives.
- **Heavier image** — runtime prerequisites grow the snapshot; acceptable and
  shared with other CLI-bootstrapped candidates.
- **Mission-loop depth vs speed** — the governed multi-step loop may cost on the
  Speed/Token dimensions; that trade-off is what the eval is designed to surface.

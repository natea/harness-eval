# Design: ScienceClaw Harness Exploration

Evidence comes from a read-only review of `lamm-mit/scienceclaw` at
`894598cd3a90` (2026-10-30).

## D1. Harness driver, not a candidate entry

Candidates layer on a harness (Claude Code, Codex, ZeroClaw). ScienceClaw owns its
loop, so it would get a `scienceclaw` entry in `config/harnesses.yaml` and a driver
in `src/driver/` implementing the existing `HarnessDriver` contract (as
`zeroclaw.ts` does). The only harness-layered surface it ships,
`openclaw-skill-pack/`, consists of 6 OpenClaw skills that shell out to
`bin/scienceclaw-investigate`. harness-eval has no OpenClaw harness, so that
doesn't help.

## D2. One investigation per trial

Session = one `scienceclaw-investigate "<topic>" --community <profile>` call. The
topic is the target's question, rendered identically for all compared harnesses.
There is no daemon, no heartbeat, and no multi-cycle runs. The trial output is the
findings document and figures that `--dry-run` would otherwise post.

## D3. Model pinning through the gateway

Set `LLM_BACKEND` and the base URL so every ScienceClaw LLM call goes to the run's
model gateway, which serves the worker model. The sandbox holds no keys for
OpenRouter, Perplexity, OpenAI or Gemini. Skills that need them must fail
closed and be recorded. Silently substituting another path would be unfair in a
way nobody can see. The fairness smoke asserts that gateway logs show exactly one
model.

## D4. Isolation

- Fresh `HOME` per trial, so `~/.scienceclaw` starts empty.
- Egress blocked to Infinite, and only to the science-database allowlist, shared
  with every harness in the run.
- Setup runs with `--quick` and a fixed profile. If any `input()` remains, the
  driver feeds fixed answers, or the exploration concludes no-go on
  non-interactivity.

## D5. Comparison design

ScienceClaw is only comparable on tasks every compared harness can attempt. Use a
small set of frozen science-question targets with rubric grading, so ScienceClaw,
`bare`, the BioNeMo toolkit, and (if added) K-Dense skills all answer the same
question with the same model and the same egress. The judge differs from the
worker model, as always.

## D6. Representativeness check

After gating, record which ScienceClaw capabilities were disabled: providers,
Infinite, memory, daemon, and specific skills. If most of its distinctive behavior
is disabled, report the result as "gated ScienceClaw", or choose the pivot.

## Risks

- **Moving target:** no tags, an active repo, and README features missing from the
  tree (`scienceclaw-openclaw-bootstrap`, `OPENCLAW_MCP.md`).
- **License ambiguity:** GitHub says Apache-2.0 but `package.json` says MIT, and
  the copied K-Dense skills say `license: Unknown`. Fine for running; matters if we
  redistribute anything.
- **Grading open-ended science** is harder than running tests. Rubric judges need
  calibrating against human scoring before results are reported.

## Open Questions

1. Is a gated ScienceClaw still worth reporting under its name, or is the K-Dense
   pivot the honest comparison?
2. Which science-question targets, and who writes the rubrics?

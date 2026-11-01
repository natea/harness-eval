# Add: NVIDIA BioNeMo Agent Toolkit as a Candidate Framework

## Why

NVIDIA is a sponsor, and the eval has no life-science candidate. The
[BioNeMo Agent Toolkit](https://github.com/NVIDIA-BioNeMo/bionemo-agent-toolkit)
("Turn any agent into a life science expert with NVIDIA BioNeMo skills") is the
right shape for harness-eval: a **pure skills pack** layered on an existing
harness. It is the same class of install as gstack's skills-dir clone. It ships
no daemon and no MCP server, and it doesn't route to other chat LLMs.

- `skills/bionemo-agent-toolkit/.claude-plugin/plugin.json` declares only
  `"skills": ["./skills/"]`. There are no commands, agents, hooks or `.mcp.json`.
- It has 45 skills, for example `boltz2-nim`, `diffdock-nim`, `evo2-nim`,
  `genmol-nim`, `openfold2/3-nim`, the `drug-discovery-pipeline` meta-skill,
  `kermt-*`, `codonfm-*` and `parabricks`.
- It targets Claude Code (plugin marketplace), Codex (`.agents/plugins`), and any
  agent through `npx skills add`.
- License: Apache-2.0 for code, CC-BY-4.0 for skills and docs, BSD-3-Clause for
  the RFD4 helpers.

Two facts make this more than a registry entry, and the gating below addresses
them:

1. **Its skills do real work off-sandbox.** 15 skills call NVIDIA-hosted NIM
   endpoints (e.g. `https://health.api.nvidia.com/v1/biology/mit/boltz2/predict`)
   with `NGC_API_KEY`/`NVIDIA_API_KEY`. Others query UniProt, RCSB, AlphaFold-EBI
   and ColabFold. These hosted models (Evo 2, GenMol, Boltz-2, DiffDock) are
   external compute, not LLM routing, but they conflict with the invariant that
   candidates have no external reach.
2. **It does nothing on today's targets.** The skills are folding, docking,
   generative chemistry and genomics. On the greenfield software targets (kanban,
   rest-api, cli-tool, notes) they would essentially never trigger, so the
   candidate would score like `bare` plus context overhead. A meaningful
   comparison needs **science-domain targets**.

## What Changes

- **Add a `bionemo-agent-toolkit` candidate** on the `claude-code` harness:
  - Install by commit-pinned clone of `skills/bionemo-agent-toolkit/skills` into
    the trial's skills dir, with a SHA assertion (the gstack pattern).
  - The only tag is `v0.1.0`, and `main` still reports version `0.1.0`, so a
    version assertion can't pin it.
  - Restrict to the **hosted-NIM and database subset**. The local-GPU and Docker
    skills (`kermt-*`, `complexa-*`, `codonfm-*`, `rfd4-proteina`,
    `parabricks`) can't run in our sandboxes, and they would fail in ways that
    look like candidate quality.
  - Session: the shared base prompt only. The skills trigger from their
    descriptions, and there are no slash commands. Use the generic continuation
    allowlist.
- **A science-run egress policy:** a per-run allowlist (NIM host, bio databases)
  and an optional `NGC_API_KEY`. Within a run, both apply **identically to every
  candidate**. A run without the key is a skills-only control.
- **Headless safety.** 19 skills list `AskUserQuestion` in `allowed-tools`, and
  some ask "Hosted NVIDIA API or local Docker NIM?". The session must never block
  on a prompt: answer with the run's fixed policy (hosted), or fail fast.
- **Secret hygiene:** add the `nvapi-` key pattern to the archiver's redaction
  list (`src/driver/archive.ts`).

## Depends on

- **Science-domain targets.** There are none today. Without them this candidate
  can only be run as a control on software targets. That dependency is tracked as
  open question 1, and is the first thing to resolve.

## Out of scope

- The local-GPU and Docker skills: no GPU sandboxes today.
- The Codex install path (`.agents/plugins`). Revisit once the claude-code path
  is validated.
- Tuning skills or prompts for the eval. The pack is installed as published, at
  the pinned commit.

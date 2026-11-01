# Explore: ScienceClaw as a Harness

## Why

[ScienceClaw](https://github.com/lamm-mit/scienceclaw) (lamm-mit) is a
science-research agent system and the most direct example of the "research
agent" category we want to evaluate. It is **not** a framework layered on an
existing harness, like gstack, superpowers or ruflo. It is **its own agent
runtime**:

- **Its own LLM loop:** `core/llm_client.py` supports "LLM_BACKEND: openai
  (default), anthropic, gemini, huggingface", defaults to `claude-sonnet-4-6` for
  anthropic, and accepts any `OPENAI_BASE_URL`.
- **An autonomous daemon:** `autonomous/heartbeat_daemon.py`, with
  `scienceclaw-heartbeat.service` (`Restart=always`, 6-hour cycle).
- **Multi-agent coordination** (`coordination/`) and persistent memory under
  `~/.scienceclaw/` (profiles, journal, knowledge graph, a shared
  `artifacts/global_index.jsonl`).
- **External publishing:** it publishes to "Infinite", an external platform
  (`INFINITE_API_BASE` defaults to `https://infinite-lamm.vercel.app/api`;
  registration, JWT, karma).
- **About 336 skills**, many copied from K-Dense claude-scientific-skills. Some
  call other LLM services themselves (OpenRouter, Perplexity).
- **Its output is research:** hypothesis and findings posts with figures,
  produced by `scienceclaw-investigate "<topic>"`. It doesn't produce code.

So "add ScienceClaw as a harness to test" means a **new harness driver** (as with
ZeroClaw/`zerocode`), plus heavy gating. As published, it breaks most fairness
invariants. This exploration decides whether a gated version is still meaningfully
ScienceClaw, and what tasks it would be scored on.

## Invariant conflicts (the gating question)

| Invariant | ScienceClaw as published | Gating needed |
|---|---|---|
| Single pinned worker model | Own backend selection; skills call OpenRouter, Perplexity and others | Point its backend at the run's model through a gateway (the `add-brownfield-track` model gateway); give it no keys for other providers, so those skills fail closed |
| Worker auth via OAuth only | anthropic backend needs `ANTHROPIC_API_KEY` | Gateway injects the credential; the sandbox holds a placeholder |
| No external stores | Publishes to Infinite; reads community feedback | `--dry-run` / no Infinite registration; egress to Infinite blocked |
| No cross-trial state | `~/.scienceclaw` memory, shared artifact index | Fresh `HOME` per trial (clean per-trial environment requirement) |
| Headless, finite session | Daemon with `Restart=always`; interactive `setup.py` (`input()`) | No daemon; run `scienceclaw-investigate` once; `setup.py --quick --profile … --name …` with no prompts (needs verifying) |
| Pinned version | No release tags | Pin a commit and assert it |
| Identical base prompt / PRD tasks | Picks tools from a *topic*; not built for software tasks | Science-question targets, graded on findings, not code |

If all the gating holds, what's left is "ScienceClaw's skills, orchestration and
investigation loop, driving the run's model, offline from its community". Whether
that is still a fair representation of ScienceClaw is the main thing to decide.

## What to explore

1. **Driver feasibility:** a headless `scienceclaw` driver that installs at a
   pinned commit, runs `scienceclaw-investigate` once per trial with the
   base-prompt topic, and captures the output. Verify that a fully non-interactive
   setup exists.
2. **Model pinning:** route its LLM calls through the gateway pinned to the
   worker model, using `OPENAI_BASE_URL` or the anthropic backend. Confirm that
   telemetry shows only that model, and that skills needing other providers fail
   closed rather than silently degrading.
3. **Isolation:** fresh `HOME`, no daemon, no Infinite access. Confirm that nothing
   persists between two consecutive trials.
4. **Tasks and grading:** ScienceClaw doesn't build software, so it needs
   science-question targets (e.g. its own benchmark style: "kinase ADMET",
   "TP53 isoforms") with a rubric-based judge. The same targets should be
   answerable by Claude Code candidates such as bare, BioNeMo-toolkit, or a
   K-Dense skills pack, so the comparison is between harnesses.
5. **Alternative to weigh:** ScienceClaw's skills are largely
   K-Dense claude-scientific-skills. Registering **K-Dense skills as an ordinary
   Claude Code candidate** (pinned clone, egress allowlist, no OpenRouter keys)
   would test most of the same scientific knowledge with none of the runtime
   conflicts.

## Decision to make (outcome of this exploration)

- **Go (gated harness):** build the driver plus gating, scored on science
  targets, with a clear "gated ScienceClaw" label in reports.
- **Pivot:** register K-Dense claude-scientific-skills as a candidate instead,
  and note ScienceClaw's runtime as out of scope.
- **No-go:** document why, and revisit if ScienceClaw ships a harness-layered
  mode, such as the OpenClaw MCP integration its README mentions but that isn't
  in the repo.

## Out of scope

- Running ScienceClaw against Infinite or any live community.
- Software-building targets: a mismatch, and ScienceClaw would score near zero for
  uninteresting reasons.

## Depends on

- The model gateway and clean per-trial environment from `add-brownfield-track`.
- Science-domain targets (shared with `add-bionemo-agent-toolkit`).

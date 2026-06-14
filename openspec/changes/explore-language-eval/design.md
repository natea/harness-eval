# Design: Language-Effectiveness Evaluation (Exploration)

## Context

The harness measures agents (frameworks × harnesses × models) against a fixed
task. `ai-coding-lang-bench` inverts this: fix the agent, vary the language,
measure efficiency. Most of our machinery is axis-agnostic — targets carry a
spec + frozen test plan + fixtures, the orchestrator runs a trial matrix with
isolation + telemetry, and scoring already has pass@1, speed, and cost. The open
question is whether "language" is best modeled as a new run axis or as
target variants, and what breaks (fairness, judging, build/run contract).

## Goals / Non-Goals

**Goals:**
- Decide if/how the language axis fits the existing model with minimal new
  concepts.
- Prove it end-to-end with a small spike (one target, 2–3 languages) and real
  numbers.
- Surface the fairness and metric pitfalls before any production build.
- Produce a go/no-go recommendation and a concrete follow-up design.

**Non-Goals:**
- Building the full 13+ language matrix or matching ai-coding-lang-bench's scale.
- Cross-language *quality* judging in v1 (LLM judges carry language bias).
- Changing existing harness/model/target evaluation behavior.

## Decisions (proposed, to be validated by the spike)

- **D1 — Language is an orthogonal run axis, not a candidate.** Reuse the
  pattern established by `add-pluggable-models` (the model axis): hold
  harness+model fixed, collapse the candidate dimension to a single fixed agent
  (bare Claude Code), and vary `--language`. This avoids conflating "framework"
  with "language."
- **D2 — One polyglot target, language-neutral.** A single `target.yaml` whose
  PRD is implementation-language-agnostic and whose test suite is a black-box
  CLI contract (stdin/stdout/exit-code or filesystem effects), runnable against
  any language's build. The cold-start contract generalizes from
  `setup.sh`/`start.sh` to a **per-language build+run recipe** (how to install
  toolchain, build, and invoke the produced program).
- **D3 — Test suite is language-independent and library-neutral.** Follow
  ai-coding-lang-bench's key fairness lesson: it specified a *custom* hash rather
  than SHA-256 so that languages with/without a stdlib SHA wouldn't be
  advantaged. Our polyglot spec must avoid any requirement that a subset of
  languages get "for free" from their stdlib/ecosystem.
- **D4 — Metrics: pass@1 + efficiency, no quality judge in v1.** Reuse
  telemetry (wall-clock, cost, tokens); add **LOC** (lines of the generated
  implementation, excluding tests/generated lockfiles). Drop the code-quality
  judge for language-eval (cross-language bias); the composite is pass-gated
  efficiency.
- **D5 — Cross-language ranking is allowed within a run.** Unlike cross-*target*
  aggregation (which we refuse, since different test plans = different scales),
  a language-eval run uses the *same* target across languages, so ranking
  languages against each other is the whole point and is valid.
- **D6 — Per-language sandbox images.** Each language needs its toolchain.
  The spike can lean on a provider image with a few toolchains preinstalled, or
  per-language install steps in the build recipe; production would want
  per-language snapshots (cost/perf).

## Risks / Trade-offs

- [Library-availability bias] → library-neutral spec (D3); explicitly forbid
  stdlib shortcuts that only some languages have. The spike must include at
  least one dynamic and one static language to expose this.
- [Toolchain setup dominates wall-clock] → measure agent working time separate
  from build/test time (telemetry already separates setup); decide which clock
  the ranking uses (ai-coding-lang-bench measured end-to-end generation time).
- [Quality is invisible without a judge] → accept pass@1 + efficiency only for
  v1; note that "fast + cheap" ≠ "maintainable" and flag it in the report.
- [Sandbox image sprawl] → spike with a single multi-toolchain image; defer
  per-language snapshots to the follow-up.
- [Scope creep into a full benchmark] → hard cap: one target, ≤3 languages,
  n≤3 trials; the deliverable is a recommendation, not a leaderboard.

## Open Questions (the exploration answers these)

- Which clock defines efficiency — agent generation time, or end-to-end
  including build+test? ai-coding-lang-bench used generation time.
- Is the candidate dimension truly collapsible, or do we want "framework ×
  language" later (does a framework's language affinity matter)?
- Does LOC belong in the composite or only as a reported signal?
- Reuse an existing target's spec re-cast as language-neutral, or author a fresh
  mini-git-style CLI? (mini-git is proven by the reference benchmark.)

## References

- [`mame/ai-coding-lang-bench`](https://github.com/mame/ai-coding-lang-bench) —
  mini-git spec (v1: init/add/commit/log; v2: status/diff/checkout/reset/rm/show),
  15 language configs, 20 trials each (600 runs), Claude Opus 4.6, pass =
  test-v*.sh green; metrics time/cost/LOC; custom-hash fairness control;
  finding: dynamic langs fastest/cheapest at prototyping scale, type-checking
  1.6–3.2× overhead.

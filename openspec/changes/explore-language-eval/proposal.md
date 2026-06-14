# Proposal: Explore a Language-Effectiveness Evaluation Mode

## Why

The harness today answers "**which coding framework/harness/model** builds a spec
best," holding the *task* fixed and varying the agent. A different and valuable
question is "**which programming language** lets an AI agent build a spec most
efficiently" — holding the agent fixed and varying the implementation language.

[`mame/ai-coding-lang-bench`](https://github.com/mame/ai-coding-lang-bench)
demonstrates exactly this: it has Claude Code (Opus 4.6) implement a "mini-git"
spec across 15 language configurations (dynamic, static, type-checked,
functional), 20 trials each (600 runs), scoring pass/fail against a fixed test
suite plus wall-clock time, API cost, and lines of code. Its finding — dynamic
languages (Ruby/Python/JS) are fastest and cheapest at prototyping scale, while
type-checking adds 1.6–3.2× overhead — is the kind of result our harness is
already 80% built to produce.

This change is a **feasibility exploration**: determine whether the language
axis fits our existing target/orchestration/telemetry/scoring machinery, build a
thin end-to-end spike, and recommend go/no-go (and shape) for a full build —
rather than committing to the full feature up front.

## What Changes

This is scoped as **investigation + a minimal spike + a recommendation**, not a
production feature:

- **Map the axis onto existing abstractions.** Assess how "language" relates to
  our `eval-targets` (PRD + frozen test plan + fixtures), `eval-orchestration`
  (the run matrix), `run-telemetry` (time/cost/tokens), and the scoring
  dimensions. The likely shape: language becomes a **new orthogonal run axis**
  (like the model axis from `add-pluggable-models`), with harness+model held
  fixed and the language varied; the candidate dimension collapses to a single
  fixed agent (e.g. bare Claude Code).
- **Author one polyglot target** — a language-agnostic spec (a small CLI, e.g. a
  mini-git or simpler) with a **language-independent test suite** that runs
  against any implementation via a per-language build/run contract.
- **Spike a 2–3 language run** end-to-end (e.g. Python, Go, Rust) through the
  existing orchestrator with a `--language` axis, producing a per-language
  scorecard with pass@1, wall-clock, cost, tokens, and a new **LOC** metric.
- **Document the fairness pitfalls** the spike surfaces (e.g. ai-coding-lang-bench
  used a *custom* hash algorithm so SHA-library availability wouldn't bias
  languages — our spec must be equally library-neutral; quality judging is
  language-biased and may need to be dropped or made language-blind).
- **Produce a recommendation**: whether to build the full language-eval mode,
  the design (axis vs. target-variant), the metric set, the fairness rules, and
  an estimate — as a follow-up `add-language-eval` change.

## Capabilities

### New Capabilities

- `language-eval`: A run mode that holds harness+model fixed and varies the
  implementation language across a language-agnostic target, scoring pass@1 +
  efficiency (time/cost/tokens/LOC) and permitting cross-language ranking within
  a run. (This change validates the capability with a spike; full build is a
  follow-up.)

## Impact

- New `targets/<polyglot>/` with a language-neutral spec, a per-language run
  contract, and a language-independent test suite (the spike's deliverable).
- Exploratory `--language` plumbing through the orchestrator and a per-language
  scorecard; kept behind the spike and not wired into default runs.
- A new **LOC** metric (lines of generated implementation) alongside existing
  telemetry; quality judging likely excluded from language-eval (cross-language
  judge bias).
- A written feasibility report + go/no-go recommendation; if "go," a follow-up
  `add-language-eval` change carries the production build.
- No change to existing harness/model/target evaluation behavior; this is
  additive and spike-gated.

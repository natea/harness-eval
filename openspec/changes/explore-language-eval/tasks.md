# Tasks: Explore a Language-Effectiveness Evaluation Mode

> Exploratory: investigation + a thin end-to-end spike + a go/no-go
> recommendation. Hard cap: one target, ≤3 languages, n≤3 trials.

## 1. Investigation

- [ ] 1.1 Map the language axis onto existing capabilities (eval-targets,
  eval-orchestration, run-telemetry, scoring); confirm or revise D1 (language as
  orthogonal axis vs. target variants)
- [ ] 1.2 Review `ai-coding-lang-bench` methodology in depth (task design,
  fairness controls, metrics, per-language run scripts) and extract what to
  reuse vs. adapt
- [ ] 1.3 Decide the efficiency clock (agent generation time vs. end-to-end
  incl. build+test) and whether LOC enters the composite or is report-only

## 2. Polyglot target (spike)

- [ ] 2.1 Author one language-neutral spec (mini-git-style CLI or simpler) with
  an explicit, library-neutral contract (no stdlib-shortcut bias)
- [ ] 2.2 Author a black-box test suite that runs against any language's build;
  define the per-language build-and-run contract for the spike languages
- [ ] 2.3 Provide toolchains: a single multi-toolchain sandbox image or
  per-language install steps for the spike languages (e.g. Python, Go, Rust)

## 3. Spike run

- [ ] 3.1 Thread a minimal `--language` axis through the orchestrator (behind
  the spike, not wired into default runs)
- [ ] 3.2 Add a LOC metric and a per-language scorecard (pass@1, wall-clock,
  cost, tokens, LOC); quality judge disabled for this mode
- [ ] 3.3 Run the spike (1 target × 2–3 languages × n≤3, worktree/local first);
  capture real numbers

## 4. Recommendation

- [ ] 4.1 Write a feasibility report: what fit cleanly, what broke, fairness
  pitfalls observed, metric/clock decisions, sandbox-image findings
- [ ] 4.2 Go/no-go recommendation + proposed shape (axis vs. variant, metric
  set, fairness rules) and a rough effort estimate for a follow-up
  `add-language-eval` change

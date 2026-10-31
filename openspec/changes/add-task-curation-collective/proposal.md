# Proposal: Task curation collective (mine-time, multi-agent)

## Why

`add-brownfield-track` labels each task bundle with a single gold-aware LLM
classifier (D9) and calibrates it against blind human labels in Studio (D15).
Those labels decide the leak strata, prompt-variant analysis, and test fairness
that every brownfield result depends on. One model that sees everything is a
single point of failure. The spike already shows it must judge very different
evidence at once: issue text, the gold patch, tests, and bot guesses that are
confidently wrong.

Splitting curation across agents that each hold **different private evidence**,
and deciding by quorum, may produce labels that agree better with humans. The
human labels D15 already collects let us **measure** that against a
single-agent and a centrally controlled baseline at equal budget. Doing this at
**mine time** freezes every decision into the bundle, so trials, prompts and
grading stay exactly as `add-brownfield-track` specifies, with no drift at run
time.

## What Changes

- **New capability `task-curation`:** a mine-time curation step that produces a
  bundle's curation labels from one of three interchangeable **arms**:
  - `single`: today's D9 classifier, one agent with all the evidence
  - `controller`: one planner that delegates to role agents and writes the final labels
  - `collective`: role agents with distinct evidence that post typed verdicts to
    a shared record, with labels decided by a fixed quorum rule and no planner
- **Curation decisions:**
  - leak level per body and per comment (the existing D9 scale)
  - test fairness
  - eligibility flags (flaky or env-broken tests worth excluding, an `appEgress`
    need)
  - a difficulty stratum
- **Four role agents**, each with its own evidence:
  - *issue reader*: issue at T* only; makes a blind localization and fix guess
  - *gold comparer*: issue plus reference patch
  - *test auditor*: tests patch plus validation results
  - *history agent*: past commits and blame on the touched files, base commit only
- **Equal-budget comparison:** all three arms run on the same bundles under the
  same token/USD cap. Each is scored against blind human Studio labels on
  per-level accuracy, Cohen's κ, test-fairness agreement and cost.
- **Output** keeps the existing `leaks.json` item schema, adds the other
  decisions and a provenance block (arm, models, prompt hashes, per-agent
  verdicts), and is frozen into the bundle hash. Runs read only the chosen
  arm's frozen labels.

Runtime behavior (trials, prompts, grading, audit) is unchanged.

## Capabilities

### New Capabilities
- `task-curation`: mine-time production of brownfield curation labels through
  interchangeable arms (single, controller, collective), with a quorum rule,
  frozen provenance, and an equal-budget comparison against human labels.

### Modified Capabilities
<!-- None. This depends on capabilities introduced by the in-flight
     `add-brownfield-track` change (brownfield-tasks, the eval-studio review
     view); their requirements are not changed here. -->

## Impact

- **Depends on** `add-brownfield-track`:
  - the bundle format and the D9 leak schema
  - the D15 Studio human labels
  - PR #81 (spec notes), which this branch is stacked on
- **New code:** `src/brownfield/curation/` (role agents, shared verdict record,
  quorum rule, arms, comparison report), a `curate` CLI subcommand, and role
  prompts in `config/`.
- **Spend:** the spike's single classifier cost about $0.02 per issue. Three arms
  on the 37 spike issues should cost a few dollars in total.
- **Constraint:** every model used in an arm must differ from the worker model
  of any run that uses its labels (same rule as D9).

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
single-agent and a centrally controlled baseline under one spend cap. Doing this at
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
  - advisory eligibility flags (tests proposed for exclusion, an `appEgress`
    need), surfaced for human review and never applied automatically
  - a `difficulty` field, distinct from the brownfield `leakStratum`
- **Four role agents**, each with its own evidence:
  - *issue reader*: issue at T* only; blind file localization on cumulative
    prefixes of the thread, round 1 only, never sees other verdicts
  - *gold comparer*: issue plus reference patch
  - *test auditor*: issue plus tests patch plus validation results
  - *history agent*: past commits and blame on the touched files, base commit only
- **Quorum rule in code:** median of the role votes with abstentions, even
  splits resolved upward, and a gold cap (an item the gold comparer finds
  inconsistent with the reference is at most `symptom`).
- **Comparison under one spend cap:** all three arms run on the 14
  human-labeled paper-qa bundles under the same per-bundle token/USD cap. Each
  is scored against blind human Studio labels on per-level accuracy, Cohen's κ,
  test-fairness agreement, cost and accuracy per dollar, with per-role vote
  accuracy and bundle-level bootstrap CIs.
- **Output** keeps the existing `leaks.json` item schema, adds the other
  decisions and a provenance block (arm, models, prompt hashes, per-agent
  verdicts), and is frozen into the bundle hash. Runs read only the chosen
  arm's frozen labels.

Runtime behavior (trials, prompts, grading, audit) is unchanged; curation never
alters the scored test set or trial setup.

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
  - the D15 Studio human labels (`review/labels.jsonl`, 14 paper-qa bundles)
  - `src/brownfield/classify.ts` and `src/brownfield/agreement.ts`
- **New code:** `src/brownfield/curation/` (role agents, shared verdict record,
  quorum rule, arms, comparison report), a `curate` CLI subcommand, and role
  prompts in `config/`.
- **Spend:** the spike's single classifier cost about $0.02 per issue. Three arms
  on the 14 labeled bundles should cost a few dollars in total.
- **Constraint:** every model used in an arm must differ from the worker model
  of any run that uses its labels (same rule as D9).

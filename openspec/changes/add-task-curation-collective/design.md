# Design: Task curation collective

## Context

`add-brownfield-track` (in flight, plus the spec notes in PR #81) mines task
bundles and labels leakage with one gold-aware classifier, `classify.ts` (D9):
headless `claude -p`, structured output, about $0.02 per issue. Blind human
labels come from the Studio review page (D15). The spike left 37 paper-qa
snapshots in `brownfield/paper-qa/snapshots/` and 37 classifier outputs in
`brownfield/paper-qa/leaks/`, plus a `summary.json` in each. Those classifier
outputs are this design's `single` arm and its output schema. See
proposal.md for motivation.

```
 bundle (frozen inputs)                    arms (mine time)                     output (frozen)
 issue@T*, reference.patch,  ─┬─▶ single:     one agent, all evidence ─┐
 tests.patch, validation,     ├─▶ controller: planner → role agents    ├─▶ curation/<arm>/{labels,record,provenance}
 sealed repo history          └─▶ collective: role agents ⇄ record     │        │
                                              → quorum rule (code)     ┘        ▼
                                                              compare vs Studio human labels (κ, acc, $)
```

## Goals / Non-Goals

**Goals:**
- An equal-budget, three-arm comparison on the paper-qa pilot that someone can audit.
- Zero change to trial-time behavior: runs only read frozen labels.

**Non-Goals:**
- Choosing per-PR trial conditions such as harness settings, prompts or
  timeouts. Varying those per task would break the comparison between
  candidates.
- A general multi-agent framework. Roles, rounds and the rule are fixed for this
  pilot.
- Replacing human review. Human labels remain the ground truth.

## Decisions

### D1. Mine time, not run time
Curation runs once per bundle while the bundle is being prepared, and its output
is hashed with the bundle. *Alternative:* a collective deciding at trial start.
Rejected because labels could then differ between trials, provenance would need
to cover a live process, and frozen inputs and identical prompts across
candidates could no longer be guaranteed.

### D2. The single arm is D9, unchanged
`single` runs the existing classifier prompt and schema, extended only with the
fairness, eligibility and difficulty fields. The baseline is therefore the thing
we would otherwise ship. The existing `leaks.json` stays as the single arm's
leak output, for compatibility with `add-brownfield-track`.

### D3. Four roles, chosen for distinct evidence
| Role | Evidence | What only it can contribute |
|---|---|---|
| Issue reader | issue at T* (the chosen variant's full text) | **Blind** localization and fix guess. If it finds the reference files from the text alone, the text leaks location. This is measured, not judged. |
| Gold comparer | issue + reference patch | Leak level per item, with evidence (the D9 judgment) |
| Test auditor | tests.patch + validation (F2P/P2P/flaky/env-broken) | Test fairness: do the hidden tests check only behavior the issue describes? Also proposes tests to exclude. |
| History agent | `git log`/blame on touched files, base commit only | Difficulty: conventions, recent churn, whether a similar earlier fix exists |

*Alternative:* one gold-aware agent per item, with N copies voting. Rejected
because copies with the same evidence don't count as decentralized agency and
give correlated errors.

### D4. Shared record and rounds
Each `curation/collective/record.jsonl` line holds a typed verdict:
`{agent, decision, item?, value, confidence, evidence, objects_to?}`.

Round 1: all roles run in parallel on their own evidence. Round 2: each role
reads the record and may post at most one revision or objection. The scheduler
is plain code that starts rounds and never decides labels, so there is no
planner.

### D5. Quorum rule (code, versioned by hash)
- **Leak level per item** has three votes:
  1. the gold comparer's label
  2. a vote derived from the issue reader by deterministic overlap: if the
     blind-localized files cover the reference files, it votes ≥ `diagnosis`;
     if its fix guess matches, it votes `fix_sketch`; otherwise `symptom`
  3. the test auditor's label of whether the text names the tested behavior or
     identifiers

  The median wins. Ties go to the higher level.
- **Fairness:** `fair` needs both the test auditor and the gold comparer.
  Otherwise the verdict is `unfair` if either says unfair, else `unsure`.
- **Difficulty:** a rule over reference diff size, blind-localization success,
  and the history agent's similar-fix finding, giving `easy`, `medium` or `hard`.
- **Freezing:** the rule is fixed and hashed **before** any human labels are
  compared, so it can't be tuned to the answer.

### D6. Controller arm
One planner agent gets the four roles as tools. Each tool returns that role's
verdict with the same private evidence. The planner writes the final labels
itself. It gets the same per-bundle cap. This tests whether it's the
**decentralization**, not the role decomposition, that adds value.

### D7. Budget
There is one per-bundle cap (tokens and USD) for every arm. Set it at 4× the
single arm's median spend on the pilot, measured first, so the role arms can run
without the single arm being artificially limited. Actual spend is reported per
arm, so a cost-adjusted comparison is possible.

### D8. Models and invocation
Agents run through headless `claude -p` with structured output and no tools,
`--strict-mcp-config` and empty setting sources (the D9 pattern). The model is
configurable per role and recorded. The pilot uses one model for all roles, so
the comparison isolates evidence and organization from model differences.
Independence from worker models is checked at run validation, as in D9.

### D9. Output layout and comparison
Each arm writes `curation/<arm>/labels.json`, `record.jsonl` (collective and
controller only) and `provenance.json` into the bundle. All of them are included
in the manifest hashes.

`curate compare` joins arm outputs with `review/labels.jsonl` and reports the
following per arm, for bundles where every arm is within budget:
- per-level accuracy
- Cohen's κ
- fairness agreement
- spend
- disagreements

Studio is unchanged. Its blind mode already hides model labels until the
reviewer submits.

## Risks / Trade-offs

- **Few human labels mean wide confidence intervals.** Label all 37 spike issues
  (the D15 plan already does), report bootstrap CIs, and present it as a pilot.
- **The rule could be tuned on the evaluation data.** Freeze it by hash before
  comparing (D5), and leave any later revisions out of the headline numbers.
- **A single model limits diversity.** Accepted, since evidence diversity is the
  variable. Varying the model per role is a follow-up.
- **The collective costs more.** Report accuracy per dollar beside raw accuracy.
  A collective that doesn't beat the single arm at equal spend is a valid
  negative result, so report it.
- **The issue reader's overlap vote is coarse:** blind localization can succeed
  for reasons other than a leak, such as a traceback. Keep it to one of three
  votes, and check its precision against the human labels.

## Migration Plan

Additive only. Bundles without curation output keep using `leaks.json`. Runs
default to `--curation single` until the pilot comparison is done.

## Open Questions

1. Should a later version give each role a different model provider (for
   example Gemini Flash), once the single-model pilot reads out?

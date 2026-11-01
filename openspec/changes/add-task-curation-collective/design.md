# Design: Task curation collective

## Context

`add-brownfield-track` mines task bundles into
`brownfield/<owner>__<repo>/tasks/<task>/` (`snapshot.json`, `issue/{body,body+human,body+all}.md`,
`reference.patch`, `tests.patch`, `validation.json`, `leaks.json`) and labels
leakage with one gold-aware classifier, `src/brownfield/classify.ts` (D9):
headless `claude -p`, structured output, about $0.02 per issue. Blind human
labels come from the Studio review page (D15) as `review/labels.jsonl`, and
`src/brownfield/agreement.ts` computes agreement. The existing `leaks.json` files
are this design's `single` arm and its output schema. See proposal.md for
motivation.

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
- A three-arm comparison under one per-bundle spend cap on the paper-qa pilot that someone can audit.
- Zero change to trial-time behavior: runs only read frozen labels.

**Non-Goals:**
- Choosing per-PR trial conditions such as harness settings, prompts or
  timeouts. Varying those per task would break the comparison between
  candidates.
- Changing the scored test set or trial setup from curation output. Eligibility
  flags are advisory (D10).
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
| Issue reader | issue at T*, as cumulative prefixes of the thread (D4) | **Blind** localization per prefix. If it finds the reference files from the text alone, the text leaks location. This is measured, not judged. |
| Gold comparer | issue at T* + reference patch | Leak level per item, with evidence and consistency with the reference (the D9 judgment) |
| Test auditor | issue at T* + tests.patch + validation (F2P/P2P/flaky/env-broken) | Test fairness: do the hidden tests check only behavior the issue describes? Per item: does the text name the tested behavior or identifiers? |
| History agent | `git log`/blame on the reference's non-test files, base commit only | Difficulty: conventions, recent churn, whether a similar earlier fix exists |

The issue at T* is the snapshot's full retained thread (body plus every retained
comment, bots tagged), not a prompt variant: the variant is chosen per run, so it
is unknown at mine time.

*Alternative:* one gold-aware agent per item, with N copies voting. Rejected
because copies with the same evidence don't count as decentralized agency and
give correlated errors.

### D4. Blind localization on cumulative prefixes
The issue reader runs once per prefix of the thread in posting order: `body`,
`body+c1`, …, `body+c1..cN`. Each run returns up to five predicted non-test
files. A prefix **localizes** when its predicted files include every non-test
file in the reference patch (file recall = 1).

Its vote for item *k* is derived by code:
- prefix *k* localizes and prefix *k−1* did not (or *k* is the body) → `diagnosis`
- prefix *k* does not localize → `symptom`
- prefix *k−1* already localized → abstain (the item adds no new location)

There is no "fix guess" vote: matching a proposed fix is a judgment, and making
it in code would need a metric we can't justify. The issue reader therefore never
votes above `diagnosis`.

As a by-product, the `body` and `body+all` prefixes give the localization rate
of those two prompt variants; one extra run on the `body+human` text gives the
third. The extra run casts no item vote.

### D5. Shared record and rounds
Each `curation/collective/record.jsonl` line holds a typed verdict:
`{agent, round, decision, item?, value, confidence, evidence, objects_to?}`.

- **Round 1:** all roles run in parallel on their own evidence.
- **Round 2:** the gold comparer, test auditor and history agent each read the
  record and may post at most one revision or objection.

The issue reader takes no part in round 2, and its votes come from round 1 only.
Otherwise it would read the other roles' `reveals_files` and evidence, which
point at the reference files. It would then be measuring "localizes after being
told where", not leakage. The scheduler is plain code that starts rounds and
never decides labels, so there is no planner.

### D6. Quorum rule (code, versioned by hash)
- **Leak level per item:** each role casts a vote or abstains.
  1. The gold comparer votes its label. It always votes; if its call fails, the
     item is `unlabeled` and the bundle is reported as failed for this arm.
  2. The issue reader votes as in D4.
  3. The test auditor votes its label of whether the item names the tested
     behavior or identifiers.

  Take the median of the non-abstaining votes, using the latest round's vote from
  each role. With an even number of votes the median falls between two levels;
  take the higher one. Then apply the **gold cap**: if the gold comparer marks
  the item `consistent_with_reference: false`, the final label is at most
  `symptom`. This follows the brownfield rule that content inconsistent with the
  reference is labeled no higher than `symptom`, and it means the only role that
  knows the reference can't be outvoted on a confidently wrong guess.
- **Fairness:** `fair` needs both the test auditor and the gold comparer.
  Otherwise the verdict is `unfair` if either says unfair, else `unsure`.
- **Difficulty:** a rule over reference diff size, body-prefix localization, and
  the history agent's similar-fix finding, giving `easy`, `medium` or `hard`.
- **Freezing:** the rule and every role prompt are fixed and hashed **before**
  any human labels are compared, so they can't be tuned to the answer.

### D7. Controller arm
One planner agent gets the four roles as tools. Each tool returns that role's
verdict with the same private evidence. The planner writes the final labels
itself. It gets the same per-bundle cap. This tests whether it's the
**decentralization**, not the role decomposition, that adds value.

### D8. Spend cap
Every arm runs under one per-bundle **spend cap** (tokens and USD). This is an
equal cap, not equal spend. Set it at 4× the single arm's median spend on the
pilot, measured first, so the role arms can run without the single arm being
artificially limited.

- Per arm, report actual spend, and lead with accuracy per dollar alongside raw
  accuracy.
- Report the number of bundles each arm leaves `over-budget`. The expensive arms
  are likelier to exceed the cap on hard bundles, so excluding those bundles
  skews the comparison toward easy ones. Report the shared-bundle comparison and
  each arm's exclusion count together.

### D9. Models and invocation
Agents run through headless `claude -p` with structured output and no tools,
`--strict-mcp-config` and empty setting sources (the D9 pattern). The model is
configurable per role and recorded. The pilot uses one model for all roles, so
the comparison isolates evidence and organization from model differences.
Independence from worker models is checked at run validation, as in D9.

### D10. Eligibility flags are advisory
Curation may propose tests to exclude, or an `appEgress` need. These flags go to
human review and are **never applied automatically**. They don't change the
scored test set, the trial setup or grading. The deterministic validator remains
the authority on flaky and env-broken tests.

### D11. Two stratum names
`leakStratum` is the existing body leak level from `add-brownfield-track`, used
for result stratification. `difficulty` (`easy`/`medium`/`hard`) is this
change's curation output. Reports stratify by `leakStratum` and show
`difficulty` only as a curation field until it is itself validated.

### D12. Output layout and comparison
Each arm writes `curation/<arm>/labels.json`, `record.jsonl` (collective and
controller only) and `provenance.json` into the bundle. All of them are included
in the manifest hashes.

`curate compare` joins arm outputs with `review/labels.jsonl`. It reports the
following per arm, over bundles where every arm is within the cap:
- per-level accuracy
- Cohen's κ (unweighted and linear-weighted)
- fairness agreement
- spend
- disagreements

It also reports:
- **per-role vote accuracy** against the human labels (issue reader, gold
  comparer, test auditor), so a combined result can be traced to the roles that
  drive it
- **CIs from a bootstrap that resamples bundles, not items**, because items in a
  bundle are correlated

Studio is unchanged. Its blind mode already hides model labels until the
reviewer submits.

## Risks / Trade-offs

- **Small pilot, low power.** The pilot has 14 labeled bundles and about 50
  items. At that size the κ standard error is roughly 0.1, so only κ
  differences of about 0.25 or more are likely to be detectable. Present it as
  a pilot, report bundle-bootstrap CIs, and extend the comparison as more
  bundles are labeled.
- **One human labeler.** No human-to-human agreement ceiling yet, so "agrees
  better with the human" can't be separated from one labeler's habits. A second
  blind labeler on a subset is a follow-up task. Until then, reports state it as
  a limitation.
- **The rule could be tuned on the evaluation data.** Freeze it by hash before
  comparing (D6), and leave any later revisions out of the headline numbers.
- **A single model limits diversity.** Accepted, since evidence diversity is the
  variable. Varying the model per role is a follow-up.
- **The collective costs more.** Report accuracy per dollar beside raw accuracy
  (D8). A collective that doesn't beat the single arm is a valid negative
  result, so report it.
- **The issue reader's vote is coarse.** Blind localization can succeed for
  reasons other than a leak, such as a traceback in the body. Keep it to one of
  three votes, cap it at `diagnosis`, and report its accuracy separately (D12).

## Migration Plan

Additive only. Bundles without curation output keep using `leaks.json`. Runs
default to `--curation single` until the pilot comparison is done.

## Open Questions

1. Should a later version give each role a different model provider (for
   example Gemini Flash), once the single-model pilot reads out?

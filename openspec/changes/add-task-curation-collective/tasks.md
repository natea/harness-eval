# Tasks: Task curation collective

Depends on `add-brownfield-track` tasks 1.1 (bundle schema), 2.5 (spike
snapshots imported as provisional bundles) and 2.6 (human labels; 14 paper-qa
bundles labeled). Single-arm reference: `src/brownfield/classify.ts`;
agreement: `src/brownfield/agreement.ts`.

The pilot runs on the 14 human-labeled paper-qa bundles with all three arms
(sections 1, 2, 4.1–4.4). Freezing into bundles and run integration (2.5,
section 3) follow the pilot.

## 1. Shared schema and plumbing

- [x] 1.1 Curation output schema (zod) in `src/brownfield/curation/schema.ts`: leak items (D9 fields), fairness, advisory eligibility, `difficulty`, provenance; verify with unit tests that existing `leaks.json` files parse as single-arm leak items
- [x] 1.2 Agent invocation helper (headless `claude -p`, structured output, no tools, strict MCP, empty settings; per-role model; spend capture) with a per-bundle budget meter; verify with a unit test that a call over the cap marks `over-budget`
- [ ] 1.3 Evidence builders per role that emit an input manifest; verify with unit tests that the issue reader's manifest has no reference, tests, post-base content or verdicts, that the test auditor's includes the issue, and that history queries resolve only base-reachable commits

## 2. Arms

- [ ] 2.1 `single` arm: wrap the D9 prompt, add the fairness/eligibility/difficulty fields; verify on 3 bundles that the leak items match the existing `leaks.json` level for level (allowing model nondeterminism, noted)
- [x] 2.2 Role agents (issue reader on cumulative prefixes, gold comparer, test auditor, history agent) with prompts in `config/curation/`; verify each produces schema-valid verdicts on one bundle
- [x] 2.3 `collective` arm: two-round scheduler (issue reader round 1 only), append-only `record.jsonl`, quorum rule (D6) with recorded hash; verify with unit tests on hand-written records (prefix votes and abstention, even split goes higher, gold cap, missing gold vote → `unlabeled`, fairness needs both, the stale-hash check)
- [x] 2.4 `controller` arm: planner with role agents as tools, same cap; verify it writes schema-valid labels and a record on one bundle
- [ ] 2.5 Freeze: write `curation/<arm>/*` into the bundle and the manifest hashes; verify that `validate --brownfield` fails after one byte of a curation file is changed

## 3. CLI and run integration

- [ ] 3.1 `bun run src/cli.ts curate --arm single|controller|collective --bundles <ids|all> --cap <usd>`; verify with a dry run that lists the planned calls and spend estimate
- [ ] 3.2 `--curation <arm>` on brownfield runs: reads the frozen labels, records the arm in provenance, makes no model calls, and applies no eligibility flag; verify with a fake driver that no curation call happens during a trial and the scored test set is unchanged
- [ ] 3.3 Model independence check at run validation; verify it fails when a role model equals the worker model

## 4. Pilot and comparison

- [x] 4.1 Measure single-arm median spend on the 14 labeled bundles; set the cap (D8) and freeze the quorum rule and prompt hashes **before** comparing against the human labels
- [x] 4.2 Run all three arms on the 14 labeled bundles; verify a curation output or `over-budget` mark exists for every arm and bundle
- [x] 4.3 `curate compare`: accuracy, κ (unweighted and linear-weighted), fairness agreement, spend, accuracy per dollar, per-role vote accuracy, disagreements, bundle-bootstrap CIs, exclusion counts, labeler count vs `review/labels.jsonl`; verify on a synthetic labels fixture with a known κ
- [x] 4.4 Read out the comparison once; write the results, negative or not, into `brownfield/Future-House__paper-qa/curation-report.md` (pilot outputs under `brownfield/Future-House__paper-qa/curation/`, outside the bundle dirs until 2.5), stating the pilot's power and the single-labeler limitation
- [ ] 4.5 Follow-up: a second blind labeler on a subset of bundles for a human-to-human agreement ceiling; extend the comparison to the remaining paper-qa bundles once labeled

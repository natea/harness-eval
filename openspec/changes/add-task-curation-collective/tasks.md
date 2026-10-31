# Tasks: Task curation collective

Depends on `add-brownfield-track` tasks 1.1 (bundle schema) and 2.5 (spike
snapshots imported as provisional bundles). Spike reference:
`brownfield/paper-qa/spike/classify.ts`.

## 1. Shared schema and plumbing

- [ ] 1.1 Curation output schema (zod) in `src/brownfield/curation/schema.ts`: leak items (D9 fields), fairness, eligibility, difficulty, provenance; verify with unit tests that the spike's `leaks/*.json` parse as single-arm leak items
- [ ] 1.2 Agent invocation helper (headless `claude -p`, structured output, no tools, strict MCP, empty settings; per-role model; spend capture) with a per-bundle budget meter; verify with a unit test that a call over the cap marks `over-budget`
- [ ] 1.3 Evidence builders per role that emit an input manifest; verify with unit tests that the issue reader's manifest has no reference, tests or post-base content, and that history queries resolve only base-reachable commits on the sealed repo

## 2. Arms

- [ ] 2.1 `single` arm: wrap the D9 prompt, add the fairness/eligibility/difficulty fields; verify on 3 spike bundles that the leak items match the existing `leaks/*.json` level for level (allowing model nondeterminism, noted)
- [ ] 2.2 Role agents (issue reader, gold comparer, test auditor, history agent) with prompts in `config/curation/`; verify each produces schema-valid verdicts on one spike bundle
- [ ] 2.3 `collective` arm: two-round scheduler, append-only `record.jsonl`, quorum rule (D5) with recorded hash; verify with unit tests on hand-written records (tie goes higher, fairness needs both, the stale-hash check)
- [ ] 2.4 `controller` arm: planner with role agents as tools, same cap; verify it writes schema-valid labels and a record on one spike bundle
- [ ] 2.5 Freeze: write `curation/<arm>/*` into the bundle and the manifest hashes; verify that `validate --brownfield` fails after one byte of a curation file is changed

## 3. CLI and run integration

- [ ] 3.1 `bun run src/cli.ts curate --arm single|controller|collective --bundles <ids|all> --cap <usd>`; verify with a dry run that lists the planned calls and spend estimate
- [ ] 3.2 `--curation <arm>` on brownfield runs: reads the frozen labels, records the arm in provenance, makes no model calls; verify with a fake driver that no curation call happens during a trial
- [ ] 3.3 Model independence check at run validation; verify it fails when a role model equals the worker model

## 4. Pilot and comparison

- [ ] 4.1 Measure single-arm median spend on the 37 spike bundles; set the cap (D7) and freeze the quorum rule hash **before** looking at the human labels
- [ ] 4.2 Run all three arms on the 37 bundles; verify a curation output or `over-budget` mark exists for every arm and bundle
- [ ] 4.3 `curate compare`: accuracy, κ, fairness agreement, spend, disagreements, bootstrap CIs vs `review/labels.jsonl`; verify on a synthetic labels fixture with a known κ
- [ ] 4.4 Read out the comparison once human labeling (`add-brownfield-track` 2.6) is complete; write the results, negative or not, into `brownfield/paper-qa/curation-report.md`

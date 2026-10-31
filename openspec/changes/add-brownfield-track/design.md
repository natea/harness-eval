# Design: Brownfield Track

## Context

harness-eval compares harnesses on frozen greenfield PRD targets. This change adds
a second track where each task is a real, already-fixed GitHub issue replayed at
the moment before fix work began. Spike evidence (paper-qa, 2026-10-31) is cited
inline; artifacts and the throwaway scripts live in `brownfield/paper-qa/`.

```
 MINE (offline, once per task)                     RUN (per candidate)            GRADE
 merged PR ─closingIssuesReferences─▶ issue        sealed repo @ base             apply hidden tests.patch
   │                                    │          ISSUE.md (variant A/B/C)       FAIL_TO_PASS all pass?
   │                       timeline + edits        offline env image              PASS_TO_PASS still pass?
   │                       replay to T*                  │                        judge (secondary)
   ▼                                    ▼          harness fixes in a branch      transcript leak audit
 split diff → reference.patch / tests.patch  ─▶  candidate.patch ─────────────────▶ score
 validate (before, gold×2) · classify leaks · freeze bundle (hashes)
```

## Decisions

### D1. A separate track, shared machinery
Brownfield tasks are a new task kind, not PRD targets. They reuse providers,
drivers, telemetry, the registry, and reporting (`Weights`, `report --weights`).
PRD targets and their freeze rules are untouched. Dimension mapping:
`prdAdherence` → **resolution** (hidden tests), `codeQuality` → judge, speed and
tokenSpend unchanged.

### D2. Task bundle (the unit of freezing)
```
brownfield/<owner>__<repo>/tasks/<task-id>/      # task-id = pr<PR>-issue<N>
  task.yaml          repo, PR, issue(s), base SHA, T*, env digest, test cmd,
                     FAIL_TO_PASS[], PASS_TO_PASS[], env_broken[], sha256 of every file below,
                     leak levels, dates (issue/PR) for contamination flags
  issue/body.md  issue/body+human.md  issue/body+all.md   # what the worker sees
  snapshot.json      structured reconstruction (comments, authors, isBot, edit sources)
  reference.patch    SEALED: non-test hunks of the PR
  tests.patch        SEALED: test hunks (incl. cassettes/fixtures)
  validation.json    before / gold1 / gold2 per-test outcomes
  leaks.json         LLM labels (model, prompt hash, per-item label/evidence)
  review/labels.jsonl  human labels, append-only
```
Bundles are mined once and never re-fetched at run time (GitHub content drifts);
runs record the bundle hashes exactly as PRD runs record `prdSha256`.

### D3. Cutoff T*
`T* = min(PR createdAt, earliest authoredDate/committedDate over PR commits,
first CrossReferenced/Connected event from the PR) − 1s`.
Spike: first PR commit set T* in 37/37. Commit dates are client-supplied; taking
the min of author and committer dates is conservative.

### D4. Issue reconstruction
One GraphQL query per task: `timelineItems` (labels, renames, assignees,
milestones, close/reopen, cross-refs) replayed forward to T*, plus
`userContentEdits` on the issue and each comment. Edit nodes hold the full
post-edit text; text at T* = latest edit ≤ T*, else the oldest edit (original),
else current text. Self-check: newest edit == live text (5/5 in spike). Comments
created after T* are dropped. Comment authors are tagged by GraphQL `__typename`
(`Bot` vs `User`). Images are downloaded into the bundle at mining time (the
sandbox has no network). Rendering omits URLs that point at the future.

### D5. Task eligibility
Reject when: the closing issue is in another repo; the PR changes no non-test
code; the PR changes no test code; **the issue was created after T*** (2/37 in
spike — fixer's notes, e.g. a bare permalink to the line to change); validation
yields no FAIL_TO_PASS; or a gold run regresses a PASS_TO_PASS test.

### D6. Base commit and sealed history
Base = first parent of the merge commit (all paper-qa merges are squash). The
workspace repo is rebuilt from a single branch at base (`--single-branch
--no-tags`), remotes and reflog removed, future tags excluded; a check asserts the
merge SHA and all post-base commits are unreachable *and* absent (`git cat-file`,
`git fsck --lost-found`). Past history is kept (it's legitimate context, and
SWE-bench found tasks that need it). Motivated by SWE-bench issue #465 (agents ran
`git log --all` and found the fix).

### D7. Environment and offline tests
Install from the base commit's `uv.lock` (`uv sync --frozen`, reinstalling the
project package so generated files like `version.py` exist — a spike bug). No
lockfile → time-capped resolve (`uv pip install --exclude-newer <base date>`),
the uv analogue of RepoLaunch's time-gated pip proxy. Tests run offline:
cassette playback forced (`GITHUB_ACTIONS=true` for paper-qa's conftest, which
predates its 2026-10-25 offline mode), credentials blanked, and a dead HTTP proxy
so un-cassetted live-API tests fail in seconds instead of retrying to timeout.
paper-qa's VCR config matches on method/host/path/query, **not body**, so a fix
that changes a prompt still replays.

### D8. Validation
Run the test command at base+tests.patch (before) and base+tests+reference twice
(gold). Per test: fail→pass in both gold runs = FAIL_TO_PASS; pass→pass =
PASS_TO_PASS; differs between gold runs = flaky (dropped); fails in gold either
way = env_broken (excluded, never scored). Production validation uses the full
offline suite for PASS_TO_PASS; the spike only ran PR-touched test files.

### D9. Leak classification
A gold-aware LLM labels the body and each kept comment:
`noise < symptom < diagnosis < fix_sketch < fix_code`, with verbatim evidence,
files revealed, `consistent_with_reference`, and author role (issue author,
future fixer, maintainer, other, bot). A wrong guess is `symptom`. Runs through
headless `claude -p` (OAuth, `ANTHROPIC_API_KEY` blanked) like the grader; the
classifier model must differ from any run's worker model. Spike: Sonnet 5.5,
≈$0.02/issue, spot-checks accurate.

**Body leaks are a difficulty stratum, not an exclusion.** Reporters often paste
the fix into the issue (#1310, #710); a real developer saw that too.

### D10. Prompt variants
`body` | `body+human` | `body+all` (humans + bots), chosen per run and identical
across candidates. Bot comments are **kept** (increasingly common in real
issues); the human/bot split isolates whether bot guesses help or mislead
(spike: of 27 dosubot comments, ~7 consistent with the fix, ~17 confident but
wrong). Analysis is paired per task and restricted to tasks where variants
actually differ (~15/37 in spike).

### D11. Anti-cheat
- Base prompt carries a generic clause ("do not consult upstream history, pull
  requests, issues, or releases beyond what is provided"); it never names the PR.
- Trial network egress blocked except the model API; dependencies are prebaked.
- Server-side web tools (Claude Code WebSearch/WebFetch, equivalents in other
  harnesses) disabled for **every** candidate via harness config — sandbox
  firewalls can't see them.
- Transcript audit (D13) is the backstop; any reach disqualifies the trial.

### D12. Grading
After the trial, the candidate's tree gets `tests.patch` applied (hidden test
files overwrite any candidate edits to them), then the bundle's test command.
Resolution = all FAIL_TO_PASS pass ∧ all PASS_TO_PASS pass. Secondary signals:
LLM judge (issue + reference + candidate → equivalent/better/partial/wrong +
conventions), file-level localization precision/recall vs reference, diff-size
ratio. Neither SWE-rebench nor SWE-bench-Live scores with a judge; we keep it
secondary and calibrate it against human review.

### D13. Solution-reach audit
Scan the redacted transcript for: the PR number or URL, the merge/fix SHAs,
`github.com/<repo>/(pull|commit|compare)`, `gh pr|api`, `git fetch`/`clone` of
the upstream, and installs of the project's own package at a version newer than
base. A hit marks the trial `disqualified:solution-reach` with the evidence line.

### D14. Contamination
Record issue and PR dates per task; reports flag tasks dated before each worker
model's knowledge cutoff (SWE-rebench's approach). paper-qa has no post-cutoff
tasks for current models (last issue-linked fix 2026-03-11); accepted for the
pilot because harness comparisons hold the model fixed, but flagged in reports
and noted as compressing harness differences.

### D15. Studio task review
A `/review` view lists task bundles and shows issue variants, reference patch,
and tests patch side by side. Labeling is **blind**: LLM labels are hidden until
the reviewer submits. Keyboard labels per body/comment; plus a test-fairness
verdict (do the hidden tests only check behavior the issue describes?). Writes go
only to the bundle's `review/labels.jsonl`, append-only. An agreement view shows
per-item disagreements and Cohen's κ. This needs a narrow exception to "Scoped
writes only" (spec delta).

## Risks

- **Small pool:** ~20 paper-qa candidates, likely ~10–15 valid → wide CIs. A second,
  more active repo is the likely follow-up.
- **Contamination** (D14) inflates absolutes and may compress differences.
- **Test fairness:** hidden tests may encode names the issue never mentions
  (SWE-bench Verified's motivation) — handled by the review verdict.
- **Classifier error:** LLM labels need human calibration before analysis relies
  on them (D15).
- **Env drift for old commits:** mitigated by lockfiles; 2023–24 tasks are riskier.

## Open Questions

1. Should frozen bundles be committed (reproducible across machines, like PRDs) or
   stay gitignored? Issue text is third-party content; redistribution terms unclear.
2. May workers run the visible test suite? (Default yes — realistic.)
3. Second repository for post-cutoff tasks: which one?

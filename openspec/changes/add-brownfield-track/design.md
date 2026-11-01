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
                     leak levels, dates (issue/PR) for contamination flags,
                     human baseline (D16), appEgress allowlist (default empty; D7),
                     testPaths (all test dirs, e.g. tests/ and packages/*/tests)
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

**Bundles are committed**, like `targets/`: a frozen bundle is the brownfield
equivalent of a PRD (reproducible on any machine), and human review labels are
irreplaceable. Only regenerable bulk is gitignored (raw GraphQL dumps, the
issue-as-of-today `*.live.md`, validator logs/junit, worktrees, venvs). Issue
text is public and the pilot repo is Apache-2.0; `brownfield/NOTICE` attributes
upstreams and states that issue text belongs to its authors (same pattern as
`targets/NOTICE`). Committing sealed patches does not leak into trials: worker
sandboxes receive only the sealed repo and the issue file, never this checkout.

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
spike — fixer's notes, e.g. a bare permalink to the line to change); the
reference fix **needs** a dependency the base environment lacks
(`dependency-change`: the base environment is prebaked and offline, so a
candidate could not install the new package, and preinstalling it would hint at
the fix); the FAIL_TO_PASS tests only run on hardware the sandboxes lack
(`needs-gpu`, e.g. xarray's CuPy tests, which skip at module level); validation
yields no FAIL_TO_PASS; or a gold run regresses a PASS_TO_PASS test.

**`dependency-change` is decided by validation, not by the diff.** A PR that
touches `pyproject.toml` or a lockfile is flagged `deps-touched`. It is rejected
only if the gold runs fail in the base environment. Across the three pilot repos,
11 valid-looking fixes touched dependency files:
- 3 were config or version-number edits only;
- 1 added a dependency the base lacked and failed (zarr #4063, `msgspec`);
- 5 raised or tightened pins, or added an optional extra, yet passed against the
  base environment (paper-qa #768; zarr #4260, #4397, #4465; xarray #11338).

Rejecting on the diff alone would drop those 5 for no reason, because nothing new
has to be installed. They stay eligible with the `deps-touched` flag, so the
review page can check whether the version bump itself is part of the fix.

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

**Application network during trials.** Repos like paper-qa are themselves LLM
applications. By default (empty `appEgress`) the application's own outbound
traffic gets the same treatment as validation: recorded fixtures only, like CI;
the worker may run the visible suite in playback mode but cannot run the app
live. A task may opt in with an `appEgress` **allowlist** of provider endpoints
and model names (paper-qa: OpenAI `gpt-4o`, `text-embedding-3-*`). App traffic
is not the worker model, so the gateway (D11) checks it against this list
instead of the run's model, using a separate budget-capped credential, the same
provider-side tool rejection, and full request logging.

**Cassette misses.** A correct fix can make HTTP calls the recordings don't
cover. Detection catches both forms: vcrpy's replay-only
`CannotOverwriteExistingCassetteException`, and, in our offline setup, the
`APIConnectionError`/`ProxyError` from the dead proxy, which is what the
validator saw on paper-qa #1174. Scoring is deterministic: any `cassette-miss`
makes the trial **unresolved**, flagged for review. Excluding those trials
instead would let a broken fix that happens to miss a recording avoid failing.
Reports show resolution both as scored and with those trials excluded.

### D8. Validation
Run the test command at base+tests.patch (before) and base+tests+reference twice
(gold). Per test: fail→pass in both gold runs = FAIL_TO_PASS; pass→pass =
PASS_TO_PASS; differs between gold runs = flaky (dropped); fails in gold either
way = env_broken (excluded, never scored). Production validation uses the full
offline suite for PASS_TO_PASS; the spike only ran PR-touched test files.

### D17. Live-API tasks: classify, then recover by recording at mining time
(Numbered after D16; placed here because it extends validation.)

A task whose would-be FAIL_TO_PASS tests fail in gold because they need a live
provider API (blocked or unauthenticated network errors, e.g. `APIConnectionError`,
`ProxyError`, `AuthenticationError`) and that has no other FAIL_TO_PASS is
classified `needs-live-api` — a **recoverable** rejection, reported separately
from tasks that are genuinely unverifiable. Spike: 6 of 20 test-verifiable
paper-qa tasks (30%: #138, #512, #515, #717, #871, #1174), concentrated in the
indexing/agent code that *is* the LLM application — dropping them would bias the
pool away from what the repo actually does.

Recovery (deferred until the gateway/`appEgress` and `cassette-miss` machinery
exists, since it needs the same recording and miss detection):
1. At mining time, run only the affected tests at base+tests+reference with a
   real, budget-capped key in record mode; the new recordings join `tests.patch`
   (sealed; workers never see them). One-off cost ≈ cents per task.
2. Re-validate fully offline. The *before* run must fail for a reason other than
   a missing recording: a before-failure that is only a `cassette-miss` makes the
   FAIL_TO_PASS claim ambiguous, so the test is not counted.
3. Grading inherits the caveats: recordings match on method/host/path/query, not
   body, so a different-but-correct fix replays the reference's responses (usually
   fine, occasionally semantically wrong); a fix that calls an endpoint the
   reference never called surfaces as `cassette-miss` for review.

Live API calls at grading time are ruled out (per-grade cost, nondeterministic
answers → flaky tests, breaks offline grading).

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
- Trial network egress blocked except a run-owned **model gateway** outside the
  sandbox; dependencies are prebaked. The sandbox holds only a placeholder
  credential; the gateway injects the real one, forwards only to the run's
  provider and model, rejects (does not silently strip) any request that
  enables provider-side tools, and logs every request. Without it, a worker
  able to reach the model API could call it directly with web search enabled,
  bypassing harness config.
- **Credential: an API key.** Workers elsewhere authenticate with
  `CLAUDE_CODE_OAUTH_TOKEN`. The gateway instead injects `ANTHROPIC_API_KEY`
  (decided 2026-11-01, after the task 4.3 spike), so brownfield runs bill the
  API account, which costs real money (see Risks). The sandbox only ever holds
  a placeholder key.
- **Model slots.** Claude Code sends some background requests to its haiku
  slot, which a strict model check would reject. Every Claude Code candidate
  therefore has all slots pinned to the run's model, as `resolveClaudeCodeEnv`
  (`src/models.ts`) already does for z.ai GLM. Pinning is used rather than
  rewriting slot names in the gateway, so the gateway logs show what the
  harness actually requested.
- **Same protocol only.** Harnesses reach the gateway through their native
  endpoint override (Claude Code `ANTHROPIC_BASE_URL` against an
  Anthropic-protocol gateway; Codex `model_providers` against an OpenAI-protocol
  one). The gateway does no protocol translation. A candidate whose protocol
  doesn't match the run's gateway is refused for that run. Translating across
  protocols is out of scope (see proposal) and overlaps the pluggable-models
  work.
- **Preflight probe.** Before any trial is dispatched, each candidate sends one
  minimal request through the gateway with its real harness configuration,
  extending `model probe`, which today supports the claude-code transport only.
  A harness whose kill-switch doesn't fully stop it declaring server-side
  tools fails here, before spend, instead of failing every trial in the matrix.
- Server-side web tools (Claude Code WebSearch/WebFetch, equivalents in other
  harnesses) disabled for **every** candidate via harness config — sandbox
  firewalls can't see them; the gateway rejection is the enforcement backstop.
- Clean per-trial environment: fresh `HOME` and harness config dirs generated
  for the trial; no operator MCP servers, plugins/skills, memory files, or
  global instructions. This is not brownfield-specific, so it lands as a
  MODIFIED `Trial isolation` that applies to every trial (that requirement
  already gives each trial its own `CLAUDE_CONFIG_DIR`).
- Transcript audit (D13) is the backstop; any reach disqualifies the trial.

**Gateway spike (task 4.3, 2026-11-01, Claude Code 2.1.316, `scripts/gateway-spike.ts`).**
Claude Code ran headless with a fresh `HOME`/`CLAUDE_CONFIG_DIR`,
`ANTHROPIC_BASE_URL` pointed at a local proxy, and only a placeholder credential.
All three runs answered correctly, for about $0.0024 in Haiku calls:
- **API key works.** The client sends `x-api-key: <placeholder>`; the gateway
  replaces it with the real key.
- **Subscription OAuth works.** Given an OAuth-shaped placeholder
  (`sk-ant-oat01-…`), Claude Code itself sends `Authorization: Bearer` plus
  `anthropic-beta: oauth-2025-04-20`; the gateway only swaps the token.
  - Claude Code picks the auth scheme from which variable is set and from the
    token prefix, so **placeholders must keep the real prefix**.
- **Gateway requirements found:**
  - Pass through the `/api/hello` health check, which runs before any message.
  - Drop `content-encoding` and `content-length` when re-serving a body that
    `fetch` already decompressed.
- **Provider-side tools can appear mid-session.** With default tools on, the
  first request carried 12 tools; web search is deferred behind `ToolSearch`,
  and the `mid-conversation-tool-changes` beta is set. The rejection check
  therefore runs on **every** request. Confirmed in 4.4 (below): a loaded
  WebSearch arrives as the server tool `web_search_20250305`.
- **Decision: API key, not OAuth.** OAuth works technically, but whether
  routing a subscription token through a gateway is within the plan's terms was
  not verified. The operator chose the API key (2026-11-01). The gateway
  supports only the API key; OAuth injection is not built.

**Gateway core (task 4.4, 2026-11-01, `src/gateway/anthropic.ts`).** Policy:
- The sandbox presents a **per-run random placeholder** (`sk-ant-api03-hegw-…`).
  Anything else, including a real key, gets 401, so only that run's trials can
  use the gateway.
- Only `POST /v1/messages` and `/v1/messages/count_tokens` are forwarded, plus
  `GET /api/hello`; every other path gets 403.
- Typed tools are allowed only if they execute in the client (`custom`, `bash_*`,
  `text_editor_*`, `computer_*`, `memory_*`). Any other typed tool (web search,
  web fetch, code execution, server tool search) or an `mcp_servers`/`container`
  field is rejected with 403, never stripped.
- Claude Code env: placeholder key, `ANTHROPIC_MODEL`, `ANTHROPIC_SMALL_FAST_MODEL`,
  all three `ANTHROPIC_DEFAULT_*_MODEL` slots and `CLAUDE_CODE_SUBAGENT_MODEL`
  pinned to the run's model, nonessential traffic off.

Smoke with real Claude Code (Haiku, about $0.01): a plain prompt passed
(12 tools, none provider-side). Asked to use WebSearch, Claude Code sent
`web_search_20250305` and the gateway rejected it. The agent then got the answer
another way (it cited PyPI metadata), on a host with open egress. **The gateway
alone is not enough; the egress lockdown is required.**

**Docker egress lock (task 4.4, `src/providers/egress.ts`).** Setup runs with
network access. Before the agent starts, the trial container joins a per-run
`docker network create --internal` network and leaves every other network. That
network has no route out, no external DNS and no host access (checked
empirically). A relay container (alias `gateway`, port 8080) sits on that network
and on the bridge, and forwards HTTP only to the host gateway, with the target
fixed at run start. Verified: after the lock, curl to api.anthropic.com, pypi.org
and 1.1.1.1, and DNS for github.com, all fail, and requests through the relay
reach the gateway, which still enforces its policy. Docker Desktop for Mac
reaches a gateway bound to 127.0.0.1 via `host.docker.internal`; on Linux the
gateway must bind the docker bridge address.

**Run wiring (task 4.4, `src/gateway/run.ts`, `runTrial`).** One gateway and one
lock per run, but a **separate placeholder key per trial**, so rejections are
attributed to the trial that caused them even when trials run concurrently. The
key is revoked when the trial ends, so a leftover container can't keep calling.
In `runTrial`, the optional `egress` step runs after the harness install (which
may need the network) and before the agent:
1. Refuse a harness that doesn't speak the gateway's protocol.
2. Lock the sandbox, then run the leak probes. If any probe succeeds, the trial
   fails closed with no retry, and the agent never starts.
3. The agent gets the gateway env in place of the run's worker credentials.

Afterwards, each rejection becomes a `gateway-rejected: …` entry in
`provenance.flags` (new field; any flag means a human reviews the trial).

End-to-end check (2026-11-01, real Docker trial through `runTrial`, Claude Code
2.1.170, Haiku):
- The agent's curl to pypi.org failed (no DNS), WebSearch was rejected (403) and
  flagged, and the file write succeeded.
- Every model request carried the trial's key.
- Cost $0.36 for 5 requests. Claude Code sent 25 tools per request in the trial
  image, so even tiny trials are not free on the API key.
- Claude Code also sends an unauthenticated `HEAD /` connectivity check; it is
  rejected, has no trial attribution, and is harmless.

### D12. Grading
After the trial, test infrastructure is restored to base before `tests.patch` is
applied: the bundle's recorded `testPaths` (not inferred — paper-qa has
`packages/*/tests` as well as `tests/`), every `conftest.py`, and pytest configuration
(`pytest.ini`, `setup.cfg`/`tox.ini` pytest sections, pyproject
`[tool.pytest*]`). This blocks passing by editing fixtures, skip markers, or
collection config outside the hidden patch's paths. Any candidate edit to these
paths is recorded as `test-infra-modified` (a flag for review, not a
disqualification — adding tests is legitimate). Hidden test files then overwrite
any candidate edits to them, and the bundle's test command runs.
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

Blindness is enforced server-side (`src/brownfield/review.ts`): no classifier
output leaves the server for a task until it has a human review. That includes
the manifest's leak strata in the task list, since they are derived from the
classifier. Agreement also reports quadratic-weighted κ, because the leak scale
is ordinal.

**Pilot result (task 2.6, 2026-11-01).** One reviewer labeled the 14 valid
paper-qa tasks (50 items) against the `claude-sonnet-5-5` classifier:
observed agreement 0.52, Cohen's κ 0.34, quadratic-weighted κ 0.40 (fair, not
good). The disagreements are lopsided: where the human saw a diagnosis or fix
the classifier often said symptom (5 diagnosis→symptom, 3 fix_code→symptom), so
it under-reports leaks, the unsafe direction for stratification. Human labels
are therefore authoritative for paper-qa, and classifier labels for xarray/zarr
stay provisional until the classifier prompt is revised and re-scored against
these 50 items (or those tasks are human-labeled). Only pr293 has two human
reviews, and they disagree (diagnosis vs symptom), so human–human agreement is
unmeasured. Test fairness: 9 yes, 4 unsure, 1 no (pr1186: hidden tests extend
dedup beyond the field the issue names).

### D16. Human baseline
Computed at mining time from data the miner already fetches (PR commits,
reviews, timeline) and stored in `task.yaml`:
- `codingWindow`: T* → last PR commit before the first submitted review (→ last
  commit before merge if never reviewed). It is **not** a bound on human work time
  in either direction:
  - People multitask, which can inflate it.
  - When T* is the first PR commit (37/37 paper-qa issues), work done before that
    commit is invisible. A fixer who pushes one commit before review gets a
    window of 0 (xarray #11798).

  Commit dates are set by the committer's machine (the same caveat as D3), so
  reports label the coding window as approximate and show it alongside review
  time, never alone.
- `reviewTime`: PR createdAt → mergedAt; `reviewRounds` (submitted reviews) and
  `commitsAfterFirstReview`.
- `issueLifetime`: issue createdAt → mergedAt (context only).
- `humanDiff`: non-test lines added/removed and files touched.

Reports put agent wall-clock and USD per resolved task beside these. They SHALL
NOT claim counterfactual merge-time savings ("would have merged N days sooner"):
review and queue time is outside what an agent changes. No conversion of human
time to dollars (any rate would be a guess).

## Risks

- **Small pool (largely resolved):** 82 valid tasks across the pilot repos (14 paper-qa + 49 xarray + 19 zarr), +8 if live-API tasks are recovered (D17). Per-repo CIs stay wide for paper-qa. A second,
  more active repo is the likely follow-up.
- **Contamination** (D14) inflates absolutes and may compress differences.
- **Test fairness:** hidden tests may encode names the issue never mentions
  (SWE-bench Verified's motivation) — handled by the review verdict.
- **Classifier error:** LLM labels need human calibration before analysis relies
  on them (D15).
- **Env drift for old commits:** mitigated by lockfiles; 2023–24 tasks are riskier.
- **API-key billing:** brownfield workers bill an API key instead of the
  subscription (D11). Mitigation: per-run
  USD caps (already enforced), a smoke run with n=1 before any matrix, and a
  measured cost per trial before scaling up.
- **Selection bias:** rejecting doc-only, test-only, and dependency-change PRs
  (D5) narrows the pool to test-verifiable code fixes; results don't speak to
  other PR kinds. Report rejection counts by reason.

## Pilot repositories

Chosen from a survey of about 95 Python repos: about 45 general, about 50
scientific, plus the NVIDIA-BioNeMo org and alphaXiv/OpenResearch. Each was
validated with the spike validator (`brownfield/paper-qa/spike/validate2.ts`).

| Repo | Env | Issue-first candidates | Valid | Rejected | Post-cutoff | Body leak ≥ diagnosis |
|---|---|---|---|---|---|---|
| Future-House/paper-qa | `uv.lock` | 36 PRs (21 testable) | 14 | 6 needs-live-api, 1 issue-after-fix | **0** | 13/37 |
| pydata/xarray | **no lockfile** → `--exclude-newer` | 56 | **49** | 6 no-F2P (2 needs-gpu), 1 no test change | **all** | 24/53 |
| zarr-developers/zarr-python | `uv.lock` | 23 | **19** | 2 needs-live-api, 1 no-F2P, 1 dependency-change | **all** | 12/19 |

Findings:
- **The no-lockfile path cost xarray no tasks.** Dependency drift never broke an
  environment.
- **Bodies are leakier in scientific repos.** Maintainers often file issues that
  already name the change. That supports D9's decision to stratify by body leak
  level rather than exclude.
- **The first real post-T* body edit was seen** (zarr #4220, a reporter removing
  an empty heading). The edit-history self-check passed on all 83 xarray and zarr
  issues.
- **Bots:** xarray and zarr have only a greeter bot (`welcome`), unlike paper-qa's
  diagnostic `dosubot`. So the `body+human` vs `body+all` split mostly exercises
  paper-qa.

Not chosen:
- **openai/openai-agents-python** (~102 tasks): strong, but not science.
- **alphaXiv/OpenResearch** (19 issue-first tasks, all post-cutoff): Rust and TS,
  so it needs multi-language support. A follow-up change.
- **NVIDIA-BioNeMo repos** (0–3 tasks each): model releases without an issue
  workflow. The org's agent toolkit is proposed as a harness candidate instead.

## Open Questions

1. ~~Commit frozen bundles or gitignore them?~~ Resolved in D2: commit bundles and
   labels, ignore regenerable bulk, attribute via `brownfield/NOTICE`.
2. May workers run the visible test suite? (Default yes — realistic.)
3. ~~Second repository for post-cutoff tasks?~~ Resolved: **pydata/xarray**
   (second) and **zarr-developers/zarr-python** (third), both scientific Python
   with every fix after the worker models' cutoff. See "Pilot repositories" below.
4. Doc-only and test-only PRs are rejected for lack of a test oracle. Worth
   scoring them later with the judge alone (no resolution verdict)?

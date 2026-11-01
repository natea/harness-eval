# Tasks: Add Brownfield Track

Spike scripts to productionize: `brownfield/paper-qa/spike/{snapshot,validate,classify}.ts`.

## 1. Task bundle format + miner

- [x] 1.1 Define the bundle schema (zod) and loader in `src/brownfield/bundle.ts`: manifest, file hashes, test lists, `testPaths`, `appEgress` allowlist, dates, leak strata; hash verification
- [x] 1.2 Miner: enumerate merged PRs with closing issues; reject cross-repo / no-src / no-test / dependency-change with reasons (from `validate.ts` screens)
- [x] 1.3 T* computation and `issue-after-fix-start` rejection (from `snapshot.ts`)
- [x] 1.4 Issue reconstruction: timeline replay, `userContentEdits` rewind with self-check, bot tagging, image download, future-link stripping; render `body` / `body+human` / `body+all`
- [x] 1.5 Unit tests on recorded GraphQL fixtures (body edited after T*, comment after T*, rename, bot comment, issue-after-fix)
- [x] 1.6 Human baseline fields (D16): coding window, review time, review rounds, commits after first review, issue lifetime, human diff size; unit tests for reviewed and unreviewed PRs

## 2. Studio task review (early — unblocks human labeling)

- [x] 2.1 Read-only routes listing bundles and serving one bundle (issue variants, snapshot, patches, validation, leak strata)
- [x] 2.2 Review view: side-by-side issue / reference patch / tests patch; keyboard leak labels per item; test-fairness verdict; bot tags visible
- [x] 2.3 Blind mode: LLM labels withheld until submit; append-only `review/labels.jsonl` endpoint (the only new write)
- [x] 2.4 Agreement summary: per-item diff, per-level agreement, Cohen's κ
- [x] 2.5 Import the spike snapshots + LLM labels as provisional bundles (paper-qa 37, xarray 53 valid, zarr 19 valid; `brownfield/<repo>/{snapshots,leaks}`) so labeling can start before 3–4 land
- [x] 2.6 Human-label all paper-qa bodies and comments; record κ

## 3. Sealed repo + environment + validation

- [x] 3.1 Sealed repo builder at merge^1 (single branch, no tags/remotes/reflog) with absence checks (`cat-file`, `log --all`, `fsck --lost-found`)
- [x] 3.2 Env builder: `uv sync --frozen` + package reinstall; `--exclude-newer` fallback; record env digest
- [x] 3.3 Offline test runner: forced cassette playback, blank credentials, dead proxy, per-test timeout; junit parsing
- [x] 3.4 Validator: before / gold×2 over the full offline suite; F2P / P2P / flaky / env-broken; rejection reasons
- [x] 3.5 Leak classifier: gold-aware, structured output, model + prompt hash recorded; refuse when classifier model equals a run's worker model
- [x] 3.6 Freeze: write bundle + manifest hashes (byte-exact; `.gitattributes` marks `brownfield/**` `-text` so CRLF issue text survives checkout); `validate --brownfield` checks hashes
- [ ] 3.7 Classify `needs-live-api` (blocked/unauthenticated provider calls in gold, no other FAIL_TO_PASS); recovery per D17 — record affected tests at mining time with a budget-capped key, seal recordings in tests.patch, re-validate offline, reject cassette-miss-only before-failures. Depends on 4.3/4.7 recording + 5.1 cassette-miss detection; paper-qa targets: #138, #512, #515, #717, #871, #1174
- [x] 3.8 Validator verdicts from the spike: `deps-touched` flag with `dependency-change` decided by gold-in-base-env (D5); `needs-gpu` for module-level hardware skips; capture pytest stderr so crashes are never silent

## 4. Brownfield trials

- [x] 4.1 Run config: `--brownfield <repo> --tasks <ids|all> --variant body|body+human|body+all`
- [x] 4.2 Workspace seeding from the sealed repo + issue file; brownfield base-prompt template with generic anti-cheat clause (no PR refs); fairness test that prompts are byte-identical across candidates
- [ ] 4.3 Spike: Claude Code against an `ANTHROPIC_BASE_URL` proxy that injects (a) an API key and (b) a subscription OAuth token; record the required headers and whether (b) works and is permitted; outcome decides the gateway's default credential (API key until (b) is verified)
- [ ] 4.4 Model gateway outside the sandbox: credential injection (placeholder in sandbox), forward only to the run's model, reject provider-side tool requests, request log; same-protocol endpoint override per harness (`ANTHROPIC_BASE_URL`, Codex `model_providers`), refuse protocol mismatches; pin all Claude Code model slots via `resolveClaudeCodeEnv`; network lockdown (egress only to the gateway) per provider, starting with docker/worktree
- [x] 4.5 Gateway preflight: extend `model probe` beyond the claude-code transport; one probe request per candidate through the gateway before dispatch; fail the run before spend on rejection, naming candidate and reason
- [x] 4.6 Per-harness server-side web tool kill-switch; refuse candidates that can't comply
- [x] 4.7 Capture candidate patch at trial end
- [x] 4.8 Trial isolation (all trials, MODIFIED requirement): fresh home/config per trial with no operator MCP servers, plugins/skills, memory, or global instructions; test on the worktree provider
- [ ] 4.9 Application egress: empty `appEgress` default (recorded fixtures only); per-task allowlist of provider endpoints and models (paper-qa: `gpt-4o`, `text-embedding-3-*`) forwarded through the gateway with a separate budget-capped credential and logging

## 5. Grading + audit + reporting

- [x] 5.1 Hidden-test grading: restore test infrastructure (bundle `testPaths`, `conftest.py`, pytest config) to base and flag `test-infra-modified`; apply tests.patch over candidate tree, run offline suite, resolution verdict; detect `cassette-miss` (vcrpy replay-only exception or offline-proxy `APIConnectionError`/`ProxyError`) → unresolved + flagged
- [x] 5.2 Secondary signals: judge (issue + reference + candidate), localization P/R, diff-size ratio
- [x] 5.3 Solution-reach audit over redacted transcripts → `disqualified:solution-reach`
- [x] 5.4 Report: resolution by candidate, stratified by body leak level; paired variant comparison on tasks where variants differ; contamination flags per worker model; agent minutes and USD per resolved task beside the human baseline (no counterfactual merge-time claims); rejection counts by reason; resolution also shown excluding `cassette-miss` trials (eval-reporting)

## 6. Pilot

- [x] 6.1 Adversarial smoke: one trial instructed to "find the upstream fix" must fail to reach it and be caught by the audit; include a direct call to the model API with provider-side web search enabled, which the gateway must reject
- [x] 6.2 n=1 smoke on one paper-qa task with one candidate (real spend)
- [x] 6.3 Pilot matrix on validated paper-qa tasks × 2 candidates × variants

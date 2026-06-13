# Tasks: Pluggable LLM Providers and Models

## 1. Registry

- [x] 1.1 Define model-profile zod schema (provider, modelId, transport, env, auth, pricing) and loader with validation (judge≠worker, unknown-profile fail-fast, implicit `claude-*` profiles)
- [x] 1.2 Author `config/models.yaml`: native Anthropic profiles (opus-4-6 worker, sonnet-4-6 judge, haiku probe) + z.ai profiles (glm-5.1, glm-4.7, glm-4.5-air per docs.z.ai/devpack/tool/claude — verify model IDs and endpoint at implementation time)
- [x] 1.3 Add `ZAI_API_KEY` to `.env.example` and redaction list; document per-profile auth

## 2. Resolution and Drivers

- [x] 2.1 Resolve worker profile in the session driver: `cmdRun` resolves `--worker-model`/config.model via the registry; third-party profiles inject env (base-url + auth-token) through `SchedulerDeps.workerEnv`, native keeps the OAuth/API-key fallback; model flag from profile
- [x] 2.2 Resolve judge profile + judge≠worker guardrail + cross-vendor flag recorded (results.crossVendorJudge, scorecard caveat badge, provenance). NOTE: per-driver baseURL/env injection for a *non-Anthropic* judge is deferred — not needed yet (judge defaults to native sonnet); the guardrail/flag/recording are in place.
- [x] 2.3 Cost-source logic: `classifyCostSource` + `defaultCostSource`; recorded in results.costSource and surfaced as a scorecard cost-basis caveat (profile-priced / tokens-only).
- [x] 2.4 `cli.ts model probe <profile>` (claude-code 1-token connectivity check; resolves profile, injects env, reports reply/cost/turns)

## 3. Reporting

- [x] 3.1 Results key scores by the resolved workerModel (not config.model); scorecard shows worker/judge models + cross-vendor-judge and cost-basis caveat badges
- [x] 3.2 Resolved worker/judge profiles recorded (identity only, never keys) in provenance (TrialProvenance.workerModel) and results (workerModel/judgeModel/crossVendorJudge/costSource); new fields optional so pre-registry runs back-map to implicit profiles and still parse

## 4. Validation

- [x] 4.1 Unit tests: schema validation, implicit profiles, judge≠worker, cost-source selection
- [x] 4.2 Probe glm-4.7 live with operator's z.ai key — PASSED 2026-06-13 with a working key: `model probe glm-4.7` → `✓ probe OK, reply "OK", cost $0.027, 1 turn` through the full slot-mapping path (ANTHROPIC_DEFAULT_*_MODEL via opus slot, https://api.z.ai/api/anthropic). No protocol deviations observed at the 1-token level; full-session deviations to be assessed in the 4.3 smoke.
- [x] 4.3 One GLM smoke trial end-to-end — PASSED 2026-06-13 (gsd, worktree, --worker-model glm-4.7, build-only). status completed/uncapped, 12.4 min; GLM-4.7 built a structured Symphony impl (setup.sh, start.sh, 8 src files) via z.ai. Provenance + results record workerModel glm-4.7/z.ai/api.z.ai; scorecard renders the cross-vendor-judge and tokens-only cost-basis caveats. No protocol deviations (no caps/errors). Retro note: GLM progresses through gsd's phases slower than Claude but total wall-clock was comparable; grading (cross-vendor judge path) not yet exercised — run with --grade before a GLM matrix.
- [ ] 4.4 Add Kimi K2 / MiniMax M3 / Qwen Coder profiles — DEFERRED 2026-06-13 (operator has no keys yet). Bookmarked for later. When keys arrive: add an auth-token profile per provider in config/models.yaml (Anthropic-compatible endpoint + ANTHROPIC_DEFAULT_*_MODEL slot-mapping, same pattern as the z.ai GLM profiles), add each key to .env.example + the archive redaction list, then `model probe <profile>` before any matrix. The registry + resolution + probe path already supports this with no code changes — config only.

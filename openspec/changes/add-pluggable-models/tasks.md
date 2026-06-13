# Tasks: Pluggable LLM Providers and Models

## 1. Registry

- [x] 1.1 Define model-profile zod schema (provider, modelId, transport, env, auth, pricing) and loader with validation (judge≠worker, unknown-profile fail-fast, implicit `claude-*` profiles)
- [x] 1.2 Author `config/models.yaml`: native Anthropic profiles (opus-4-6 worker, sonnet-4-6 judge, haiku probe) + z.ai profiles (glm-5.1, glm-4.7, glm-4.5-air per docs.z.ai/devpack/tool/claude — verify model IDs and endpoint at implementation time)
- [x] 1.3 Add `ZAI_API_KEY` to `.env.example` and redaction list; document per-profile auth

## 2. Resolution and Drivers

- [x] 2.1 Resolve worker profile in the session driver: `cmdRun` resolves `--worker-model`/config.model via the registry; third-party profiles inject env (base-url + auth-token) through `SchedulerDeps.workerEnv`, native keeps the OAuth/API-key fallback; model flag from profile
- [~] 2.2 Resolve judge profile in both grading drivers (cc: env injection; sdk: baseURL+key) with cross-vendor flag plumbed to provenance — DONE: judge profile resolved + judge≠worker guardrail enforced at run start + cross-vendor caveat logged. PENDING: per-driver baseURL/env injection for a non-Anthropic judge, and writing the flag into provenance (with 3.2).
- [~] 2.3 Implement cost-source logic in telemetry (harness-reported / profile-priced / tokens-only) and surface in results/scorecard — DONE: `classifyCostSource` (native+harness→reported, third-party→profile-priced, else tokens-only) implemented + tested. PENDING: surface the source/estimate in results.json + scorecard (with 3.1).
- [x] 2.4 `cli.ts model probe <profile>` (claude-code 1-token connectivity check; resolves profile, injects env, reports reply/cost/turns)

## 3. Reporting

- [ ] 3.1 Key results by (candidate, harness, workerModel); leaderboard groups across model stacks with cross-vendor-judge and mixed-cost-source caveat badges
- [ ] 3.2 Record resolved profiles (never keys) in provenance; backward-map existing runs to implicit profiles

## 4. Validation

- [x] 4.1 Unit tests: schema validation, implicit profiles, judge≠worker, cost-source selection
- [ ] 4.2 Probe glm-4.7 live with operator's z.ai key — BLOCKED 2026-06-13 on credentials, not code. Integration verified correct: endpoint https://api.z.ai/api/anthropic reachable, model glm-4.7 accepted, request well-formed, slot-mapping (ANTHROPIC_DEFAULT_*_MODEL) implemented per z.ai docs. Direct curl returns 401 "Authentication Failed" on BOTH the Anthropic and OpenAI-compatible z.ai endpoints → the ZAI_API_KEY is invalid/expired or the GLM Coding Plan isn't active. Re-probe once a working key is supplied: `bun run src/cli.ts model probe glm-4.7`.
- [ ] 4.3 One GLM smoke trial (single candidate, n=1) end-to-end before any GLM matrix; document in retro
- [ ] 4.4 Add Kimi K2 / MiniMax M3 / Qwen Coder profiles when operator supplies keys; probe each (no matrix until smoke-tested)

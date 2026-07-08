# Tasks: Add E2B Sandbox Provider

## 1. Template

- [x] 1.1 Define the E2B template under `infra/e2b-template/` (Ubuntu base, Node 22, Bun, git, Claude Code 2.1.170, uid-1000 user), reusing the Daytona Dockerfile if the builder accepts it
- [x] 1.2 Build and push the template; pin the template tag in `config/run.defaults.yaml` (`e2bTemplate`) and document the rebuild procedure

## 2. Provider

- [x] 2.1 Add `e2b` SDK dependency; extend provider enums (`IsolationProviderId`, provenance) and CLI `--provider e2b`
- [x] 2.2 Implement `src/providers/e2b.ts` (`Sandbox.create` with budget-derived `timeoutMs`, `commands.run` with per-exec envs, tar-based copyOut, `files.write`, `kill`)
- [x] 2.3 Implement preflight validation: template exists, tier max-lifetime ≥ trial wall-clock budget (hard fail with tier guidance)
- [x] 2.4 Add lifetime heartbeat extension between session-script steps
- [x] 2.5 Add `E2B_API_KEY` to `.env.example` and the secret-redaction list

## 3. Validation

- [x] 3.1 Unit tests: enum/CLI plumbing, preflight failure paths (mocked SDK)
- [x] 3.2 Live smoke: provision → exec env propagation → writeFile/copyOut roundtrip → destroy, plus contamination check between two concurrent E2B trials
- [x] 3.3 One real candidate trial (cheapest protocol: superpowers) end-to-end on E2B; verify provenance records provider/template and scorecard generation
- [x] 3.4 Document cost-per-trial observation and tier requirements in `docs/`

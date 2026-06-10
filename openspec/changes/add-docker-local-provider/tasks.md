# Tasks: Add Docker Local Provider and Devcontainer

## 1. Shared Image

- [ ] 1.1 Move `infra/daytona-snapshot/Dockerfile` to `infra/trial-image/Dockerfile`; update Daytona build docs/command; tag scheme `harness-eval-trial:<claude-version>-<rev>`
- [ ] 1.2 Build locally and verify toolchain parity (node, bun, git, claude versions) against the Daytona snapshot

## 2. Provider

- [ ] 2.1 Extend provider enums and CLI with `docker`; add per-container memory/CPU limits to run config (default 4GiB/2 CPUs)
- [ ] 2.2 Implement `src/providers/docker.ts` (run -d with limits, exec with -w/-e via bash -lc, docker cp for writeFile/copyOut, rm -f destroy; deterministic `he-<trial-id>` names with stale-container removal)
- [ ] 2.3 Implement preflight (daemon reachable, image present with build-command hint, RAM×concurrency warning)
- [ ] 2.4 Add `cleanup` CLI subcommand for orphaned `he-*` containers

## 3. Devcontainer

- [ ] 3.1 Add `.devcontainer/devcontainer.json` (trial image + Bun, docker-outside-of-docker socket mount)
- [ ] 3.2 Verify harness tests and an end-to-end dry run pass inside the devcontainer

## 4. Validation

- [ ] 4.1 Unit tests: enum/CLI plumbing, preflight failures, stale-name recovery (mocked CLI)
- [ ] 4.2 Live contamination test: two concurrent Docker trials cannot observe each other's plugins/skills/npm globals
- [ ] 4.3 End-to-end dry run (fake executor) on Docker provider; then one real candidate trial; verify provenance and scorecard
- [ ] 4.4 Document local-run economics and limits in `docs/` (e.g. 3×4GiB concurrent trials on a 32GiB host)

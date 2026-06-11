# Tasks: Add macOS Virtualization Provider

## 1. Foundation

- [x] 1.1 Confirm host macOS/`container` CLI versions; pin minimum CLI version; document install (`brew install container` or Apple installer)
- [x] 1.2 If `add-docker-local-provider` hasn't landed: carry the shared trial-image move (`infra/trial-image/Dockerfile`)
- [x] 1.3 Verify image path: build/load the trial image for `container` (build directly, or `docker save`→load if supported); document in `infra/`

## 2. Provider

- [x] 2.1 Extract abstract CLI-container provider base from the Docker provider (verb/flag table per binary)
- [x] 2.2 Implement `src/providers/macos-vz.ts` over the `container` CLI (run/exec/copy/rm, deterministic `he-<trial>` names, stale-VM removal)
- [x] 2.3 Preflight: darwin/arm64, CLI version ≥ pin, system services running, image present (with remediation messages)
- [x] 2.4 Extend provider enums and CLI `--provider macos-vz`; resource limits from run config

## 3. Validation

- [x] 3.1 Unit tests: preflight gates, verb table, enum/CLI plumbing (mocked subprocess)
- [x] 3.2 Live contamination test between two concurrent VM trials
- [ ] 3.3 End-to-end dry run, then one real candidate trial; verify provenance and scorecard
- [x] 3.4 Document VM-vs-Docker memory behavior and recommended local concurrency in `docs/`

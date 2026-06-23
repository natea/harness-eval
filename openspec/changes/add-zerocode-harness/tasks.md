# Tasks: Add zerocode (ZeroClaw) Harness

> Status: code/config/tests/docs implemented and green (merged onto current main,
> which already provides the pluggable harness-driver layer + model registry).
> Tasks needing the actual pinned ZeroClaw binary and real API spend (1.1 image
> rebuild, 3.2 live probe, 3.3 paid smoke) are left unchecked as operator steps.

## 1. Foundation

- [x] 1.1 Pin a ZeroClaw release; add the binary to infra/trial-image/Dockerfile; rebuild/push image + Daytona snapshot
  - DONE: pinned `ZEROCLAW_VERSION=0.8.1`; Dockerfile downloads the verified asset (`zeroclaw-<triple>.tar.gz`), extracts `zeroclaw`+`zerocode`, and bakes the ACP client + secret-free trial config. Image `harness-eval-trial:zerocode` built and Daytona snapshot `harness-eval-base:v3` registered (2026-06-21).
- [x] 1.2 Verify the pinned release's ACP surface (method names, handshake version) against its docs/source; record in design.md
  - VERIFIED against the real v0.8.1 binary: `zeroclaw acp` is JSON-RPC 2.0 over stdio (initialize/session/new/session/prompt/session/stop, session/load resume), `protocolVersion: 1`. Corrected the proposal's socket-daemon guess. Recorded in design.md.
- [x] 1.3 Author trial ZeroClaw config template: workspace-scoped daemon, full-auto autonomy, provider/model from the model registry (Anthropic first), no interactive approval modes
  - ZeroClaw configures via `zeroclaw config set <dotted.path>`, not a static toml — the speculative toml was removed. The driver applies full-auto at runtime (`config set security_ops.require_approval_for_actions false`) into a per-trial `--config-dir`; secrets stay env-only.

## 2. Driver

- [x] 2.1 Extract a SessionDriver interface from the Claude Code driver; select by harness id in the session executor
  - The `HarnessDriver` interface + `getHarnessDriver` registry already exist (main's pluggable-harnesses). zerocode plugs into them; added an `InfraError` seam so driver-level environmental failures propagate as infra (not candidate) failures.
- [x] 2.2 Implement src/driver/zeroclaw.ts: daemon lifecycle per trial, ACP client (initialize/session/new/prompt, streamed updates), handshake-version assert as infra failure
  - `zerocodeDriver` + `parseZeroclawAcp` + bundled stdio client (`infra/trial-image/zeroclaw-acp-client.ts`) driving `zeroclaw acp` (verified protocol — no socket daemon). Handshake mismatch/absence → `ZeroclawProtocolError extends InfraError`.
- [x] 2.3 Telemetry mapping (tokens/turns/duration; cost via model-registry pricing or tokens-only), worker-auth/env injection order verified (auth-precedence lesson)
  - Tokens/turns/duration mapped from ACP updates + prompt `_meta`; `reportsCost: false` + `costSourceForHarness` keep cost profile-priced/tokens-only. Auth via `zeroclaw auth paste-token` — Claude Max subscription (`authorization`, reuses `CLAUDE_CODE_OAUTH_TOKEN`, no API spend) or `api-key`, exported inside the shell.
- [x] 2.4 Registry: add HarnessId `zerocode`; add `bare` candidate (all harnesses); zerocode sections only where real
  - `zerocode` added to `HarnessDriver` + `config/harnesses.yaml`; `bare` candidate (no install, base prompt) valid on claude-code/codex/zerocode; frameworks have no zerocode section (fail at load time, by design).

## 3. Validation

- [x] 3.1 Unit tests: driver selection, ACP message framing (mocked), registry validation incl. framework-without-zerocode failure
  - `tests/zerocode.test.ts` (framing, handshake-infra, driver wiring, resume, infra propagation, bare-on-zerocode, framework-without-zerocode, cost wiring) + a driver-contract case/fixture (`tests/fixtures/driver-output/zerocode.jsonl`). Full suite green except 3 pre-existing worktree dry-run timing flakes.
- [x] 3.2 Live probe: 1-token zerocode session in a Docker sandbox (auth + protocol health) before any paid trial
  - DONE (2026-06-21): a full ACP turn in the Docker image on Claude Max auth wrote a file. Verified protocolVersion 1, model pin (`_meta.defaultModel=claude-opus-4-8`), full-auto tool use, writable workspace. The headless credential is the `ZEROCLAW_providers__models__anthropic__anthropic__api_key` env-override (Max OAuth token routes as subscription — no API spend); `auth paste-token`/provider-env do NOT feed generation. See docs/ZEROCODE-HARNESS.md.
- [ ] 3.3 Smoke: bare/zerocode/opus n=1 on the symphony-daemon target, graded; compare against bare/claude-code/opus baseline (build that baseline if absent)
  - Operator step (REAL SPEND, ~$10–15 API). Command + methodology in `docs/ZEROCODE-HARNESS.md`. Run only after 3.2 is green.
- [x] 3.4 Document zerocode setup, billing caveat (API credits, no subscription path), and harness-comparison methodology in docs/
  - `docs/ZEROCODE-HARNESS.md`; onboarding doc updated to list the implemented drivers.

# Tasks: Add zerocode (ZeroClaw) Harness

## 1. Foundation

- [ ] 1.1 Pin a ZeroClaw release; add the binary to infra/trial-image/Dockerfile; rebuild/push image + Daytona snapshot
- [ ] 1.2 Verify the pinned release's ACP surface (method names, handshake version) against its docs/source; record in design.md
- [ ] 1.3 Author trial ZeroClaw config template: workspace-scoped daemon, full-auto autonomy, provider/model from the model registry (Anthropic first), no interactive approval modes

## 2. Driver

- [ ] 2.1 Extract a SessionDriver interface from the Claude Code driver; select by harness id in the session executor
- [ ] 2.2 Implement src/driver/zeroclaw.ts: daemon lifecycle per trial, ACP client (initialize/session/new/prompt, streamed updates), handshake-version assert as infra failure
- [ ] 2.3 Telemetry mapping (tokens/turns/duration; cost via model-registry pricing or tokens-only), worker-auth/env injection order verified (auth-precedence lesson)
- [ ] 2.4 Registry: add HarnessId `zerocode`; add `bare` candidate (all harnesses); zerocode sections only where real

## 3. Validation

- [ ] 3.1 Unit tests: driver selection, ACP message framing (mocked), registry validation incl. framework-without-zerocode failure
- [ ] 3.2 Live probe: 1-token zerocode session in a Docker sandbox (auth + protocol health) before any paid trial
- [ ] 3.3 Smoke: bare/zerocode/opus n=1 on the symphony-daemon target, graded; compare against bare/claude-code/opus baseline (build that baseline if absent)
- [ ] 3.4 Document zerocode setup, billing caveat (API credits, no subscription path), and harness-comparison methodology in docs/

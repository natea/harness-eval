# Design: zerocode (ZeroClaw) Harness Support

## Context — what zerocode actually is (investigated 2026-06-12)

ZeroClaw (github.com/zeroclaw-labs/zeroclaw, Rust, MIT/Apache-2.0) is an agent **runtime/daemon**: pluggable model providers (Anthropic, OpenAI, Ollama, any OpenAI-compatible endpoint, with fallback chains), tools, memory, channels, and OS-level sandboxing (Landlock/Bubblewrap/Seatbelt/Docker), run via `zeroclaw daemon`/`zeroclaw agent`. **zerocode** (shipped in v0.8.0) is its terminal UI — five panes (Chat, Code, Config, Logs, Dashboard) over a persistent RPC transport (local Unix socket / remote WSS), tmux-style persistent sessions, shell-environment pass-through. The **Code pane is "a coding workspace built on ACP, the same protocol that powers editor integrations"** — coding sessions exclude memory tools server-side and track cwd/branch/commit.

**Classification: harness, not framework.** Our layer model: framework (methodology inside an agent) → harness (the coding agent itself) → provider → model. zerocode/ZeroClaw owns the agent loop, tool execution, approvals, and model routing — that's the harness layer, peer to Claude Code/Codex/OpenCode. It is not installable *into* another agent the way Superpowers/GSD are; conversely, those Claude Code plugins do not install into it. The decoupled provider layer inside ZeroClaw actually matches our model registry cleanly: harness=zerocode, provider/model = whatever its config routes to.

## Goals / Non-Goals

**Goals:**
- Run the standard eval (same target, same prompts, same grading) with harness=zerocode, model held identical to Claude Code runs (Opus 4.6 via Anthropic provider) — the first true cross-harness comparison.
- Keep grading 100% harness-agnostic (it already consumes only workspace + telemetry).

**Non-Goals:**
- Porting Claude-Code-specific frameworks to zerocode (upstream's job; registry simply lacks zerocode sections for them, which load-time validation already surfaces).
- Using zerocode's TUI itself in trials (we drive the daemon headlessly; the TUI is for humans).
- ZeroClaw channel/gateway/webhook features, memory, multi-agent routing — out of scope; Code-pane-equivalent sessions only.

## Decisions

- **D1 — Drive via ACP against a per-trial daemon.** Each trial sandbox starts `zeroclaw daemon` (workspace-scoped config), and our driver speaks ACP (JSON-RPC over stdio/socket: initialize → session/new with cwd → session/prompt; agent streams tool-call/update notifications until turn end). ACP is the documented programmatic surface ("zero configuration: open the pane and it just works") and the same path editor integrations use — far more stable than scraping a TUI. Fallback if ACP integration stalls: `zeroclaw agent -a <alias>` with scripted stdin, accepting weaker telemetry.
- **D2 — Session-script compatibility.** The session executor gains a driver interface (`runSession(harness, …)`); the existing gate-detection/continuation logic applies to ACP message text unchanged. `newSession` maps to ACP session/new; resume maps to reusing the session id (ZeroClaw sessions persist by design).
- **D3 — Autonomy config**: trial config sets ZeroClaw autonomy to unsupervised/full-auto with workspace boundary = trial workspace (its Landlock/Docker sandboxing is redundant inside our sandboxes but harmless; keep defaults that don't prompt). Any approval request that still surfaces is answered by the continuation allowlist (deny-with-edit disabled).
- **D4 — Telemetry**: ACP/daemon usage events → SessionRecord (tokens, turns, duration measured by the driver; cost = profile-priced or tokens-only per the model registry — ZeroClaw reports no billed USD). `harnessVersion` = pinned ZeroClaw release.
- **D5 — `bare` candidate**: registry entry with empty install and the plain base prompt as its only session step, valid for every harness; gives the harness axis a controlled baseline (claude-code/bare vs zerocode/bare) and doubles as a cheap smoke candidate generally.
- **D6 — Image**: pinned ZeroClaw release binary baked into `infra/trial-image/Dockerfile` (single static-ish Rust binary; pin exact version, record in provenance).

## Risks / Trade-offs

- [ACP version drift between ZeroClaw releases] → pin the release; driver asserts the ACP initialize handshake version and fails the trial as infra (not candidate) on mismatch.
- [No subscription billing — zerocode runs burn API credits] → surfaced in run preflight (estimate from budget); start with n=1 bare smoke (~$10-15 API at Opus pricing) before any matrix.
- [Approval/sandbox policies blocking automation in ways config can't fully disable] → smoke trial exists precisely to find this; fallback D1 path; worst case mark harness experimental.
- [Fairness asymmetry: frameworks unavailable on zerocode] → compare only like-for-like keys (bare vs bare); leaderboard already groups by (candidate, harness, model) and never merges across harnesses.
- [Telemetry parity (cache tokens, turn counts may not map 1:1)] → record what exists; null/0 for unavailable fields with a provenance note; never fabricate.

## ACP surface — VERIFIED against ZeroClaw v0.8.1 (driver `src/driver/zeroclaw.ts`)

Verified by running the real v0.8.1 binary (2026-06-21), which corrected two
guesses in the original proposal:

1. **`zeroclaw acp` is a JSON-RPC 2.0 server over _stdio_**, not a socket client
   to a separate daemon. There is no `zeroclaw daemon --socket/--workspace` step;
   the agent loop runs inside the ACP server process. We drive it with a bundled
   bun stdio client (`infra/trial-image/zeroclaw-acp-client.ts`, baked into the
   image at `/opt/zeroclaw/acp-client.ts`) that the driver invokes per turn.
2. **Auth supports the Claude Max subscription** — `zeroclaw auth paste-token
   --model-provider anthropic --auth-kind authorization --token "$CLAUDE_CODE_OAUTH_TOKEN"`
   (the same token Claude Code uses; non-interactive via `--token`). The proposal's
   "no subscription path, API credits only" was wrong. API key and 74 other
   providers (incl. MiniMax) also work. `reportsCost: false` still holds (ZeroClaw
   reports tokens, no billed USD; on Max there is no per-token bill).

Method names/versions are pinned to ZeroClaw **v0.8.1**, `ACP_PROTOCOL_VERSION = 1`
(observed in the live `initialize` response). Re-pin in lockstep with the image's
`ZEROCLAW_VERSION` if the release moves.

- **Handshake** — `initialize` → response `result.protocolVersion`. Asserted ===
  `ACP_PROTOCOL_VERSION`; mismatch *or absence* (daemon never came up) throws
  `ZeroclawProtocolError extends InfraError`, so the scheduler classifies the
  trial **infra-failed** (retried) rather than grading a broken workspace. The
  session executor re-throws `InfraError` instead of recording a candidate error
  (the new `isInfraError` seam, used by both `session.ts` and `scheduler.ts`).
- **Session** — `session/new` (params `{cwd, mcpServers:[]}`) → `result.sessionId`
  (verified). Resume reuses that id via `session/load` (capability
  `sessionCapabilities.resume`); `newSession` steps omit it.
- **Prompt turn** — `session/prompt` (params `{sessionId, prompt:[{type:text,text}]}`),
  streaming `session/update` notifications until the prompt response returns a
  `result.stopReason`. Errors arrive as `{error:{code,message}}` responses.
- **Streamed updates consumed** — `agent_message_chunk` (concatenated into the
  result text used for gate detection), `tool_call` (`status: completed` counts a
  turn when `_meta.numTurns` is absent), `usage` (`tokens.{input,output,cacheRead}`).
- **Telemetry mapping** — tokens from the `usage` update or the prompt result's
  `_meta.usage`; `numTurns` from `_meta.numTurns` else completed tool-calls;
  `durationMs` from `_meta.durationMs` else 0. **`costUsd` is always 0**: ZeroClaw
  reports no billed USD, so run cost is resolved as profile-priced/tokens-only via
  `costSourceForHarness`, never harness-reported — `reportsCost: false`.
- **Auth + full-auto** — applied once per trial (marker-gated) in the driver:
  `zeroclaw auth paste-token` (Max `authorization` token from
  `CLAUDE_CODE_OAUTH_TOKEN`, else `api-key` from `ANTHROPIC_API_KEY`) into the
  trial's `--config-dir`, plus `zeroclaw config set
  security_ops.require_approval_for_actions false`. Env exported inside the shell.

## Open Questions

- **Model pinning for parity** — RESOLVED in the driver: it runs
  `zeroclaw models set <opts.model>` (the run's worker-model id, identical to the
  one Claude Code gets via `--model`), so both harnesses run the same Opus build.
  The studio Configure screen's Worker-model dropdown flows through the same path.
  Live check (3.2): confirm the id is accepted by the pinned binary's Anthropic
  catalog and that the ACP `initialize` `_meta.defaultModel` reflects it.
- **Full-auto coverage** — `security_ops.require_approval_for_actions` is verified
  in the config schema; confirm it (and any sandbox/permission keys) suppress
  every approval gate during a real ACP turn.
- **Max-token acceptance** — confirm `CLAUDE_CODE_OAUTH_TOKEN` is accepted by
  `auth paste-token --auth-kind authorization` end-to-end during the live probe.

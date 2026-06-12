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

## Open Questions

- Exact ACP method names/versions ZeroClaw implements (verify against the pinned release's docs/source at implementation time; the protocol is Zed's Agent Client Protocol).
- Whether `zeroclaw agent` has a non-interactive print mode worth using for simple steps (cheaper than ACP for one-shot prompts).
- Whether ZeroClaw's per-session environment snapshot needs explicit worker-auth injection or inherits the daemon's env (mirrors our Claude Code auth-precedence lesson — test both orders).

# Proposal: Add zerocode (ZeroClaw) as an Evaluable Harness

## Why

zerocode is ZeroClaw Labs' coding interface (v0.8.0): a terminal client to the Rust ZeroClaw agent daemon whose Code pane drives a tool-using coding agent over ACP. The community is asking how it stacks up against Claude Code. Our investigation (see design Context) classifies it firmly as a **harness** — the coding-agent layer, peer to Claude Code/Codex/OpenCode — *not* a framework like Superpowers/GSD: it is the thing that runs the agent loop (file edits, shell, approvals) with pluggable model providers underneath, rather than a methodology layered inside someone else's agent. Evaluating it exercises the harness axis of our layer model for the first time.

## What Changes

- Extend the harness axis with `zerocode`: `HarnessId` enum, candidate-registry `harnesses.zerocode` sections, and trial-image additions (ZeroClaw binary, pinned release).
- Implement a **ZeroClaw session driver** alongside the Claude Code driver: headless invocation of the daemon's coding agent (primary route: speak **ACP** over stdio/socket to a `zeroclaw` daemon — the same protocol zerocode's Code pane uses; fallback route: `zeroclaw agent` CLI if it grows a print/non-interactive mode). Telemetry mapping from ZeroClaw's usage reporting into our session records, with cost-source labeling per the pluggable-models change (`tokens-only` or profile-priced — ZeroClaw won't report Anthropic-billed USD).
- Model wiring via ZeroClaw's native provider config (Anthropic key for like-for-like Opus runs; OpenAI-compatible endpoints for GLM/Kimi later) — provider/model recorded in provenance exactly as for Claude Code runs.
- Framework axis handling: the four frameworks are Claude Code plugins and do not install into zerocode. Initial evaluable candidate is **`bare` (no framework)** on zerocode vs `bare` on claude-code — a pure harness-vs-harness comparison holding model constant; framework×zerocode combinations only if/when frameworks ship zerocode/ACP support.
- Approval policy: configure ZeroClaw's autonomy to full-auto inside disposable sandboxes (its default is supervised; deny-with-edit and approval modes must be disabled per its config policy keys), mirroring `--dangerously-skip-permissions`.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `candidate-registry`: Harness-scoped sections gain `zerocode` as a valid harness id; a `bare` candidate (no framework install) becomes a first-class registry entry usable on any harness for harness-vs-harness baselines.
- `eval-orchestration`: Headless harness invocation requirement generalizes from "Claude Code headless" to "the selected harness's documented headless protocol", with zerocode's ACP-based driver as the second implementation.

## Impact

- New `src/driver/zeroclaw.ts` (ACP client; session lifecycle; telemetry extraction); driver selection by harness id in the session executor.
- Trial image gains the pinned ZeroClaw release binary (Rust, single binary — small image delta); daemon startup/teardown managed per trial.
- New secret: provider key for ZeroClaw's model config (reuses `ANTHROPIC_API_KEY` or model-registry env vars; no new vendor account for the Anthropic route — note: ZeroClaw bills via API key, not Max subscription, so zerocode runs cost API dollars).
- Results comparability: zerocode trials are a new (candidate=bare, harness=zerocode, model) key — leaderboards group per harness; cross-harness comparison is exactly what the reporting schema was designed for.
- Risks: ACP protocol fidelity (young protocol, version drift), ZeroClaw autonomy/sandbox policies fighting trial automation, no subscription billing path.

# Proposal: Pluggable Harness Layer (Beyond Claude Code)

## Why

The harness is one of our four evaluation layers, but today only Claude Code is implemented (zerocode specced in `add-zerocode-harness`, which contributes the `SessionDriver` interface). The interesting questions — does GSD behave the same under Codex? is bare Gemini CLI faster than bare Claude Code at equal model strength? — require the harness axis to be config, not code. This change generalizes the driver layer and registers the harness landscape.

## What Changes

- **Generalize the `SessionDriver` interface** (from add-zerocode-harness) into a harness registry: each harness declares id, driver kind, headless invocation contract, telemetry mapping, auth env vars, and pinned version — mirroring `config/models.yaml`.
- **Driver kinds** (most harnesses cluster into three integration shapes):
  1. `print-cli` — headless one-shot/resumable CLI with JSON output (Claude Code today; **Gemini CLI** `gemini -p`; **Qwen Code** (Gemini CLI fork) `qwen -p`; **Codex** `codex exec`; **Grok CLI**; **Pi.dev** pi CLI; **Kimi Code** CLI)
  2. `acp` — Agent Client Protocol over stdio/socket (**zerocode/ZeroClaw**; **Goose** ACP mode; others as they adopt ACP)
  3. `sdk-server` — programmatic session APIs (**OpenHands** headless/SDK mode; **OpenCode** server mode)
- **Harness catalog** (registered with status: implemented / specced / candidate / unknown):
  - **Big players:** Claude Code (Anthropic) — implemented; Codex (OpenAI) — candidate; Gemini CLI (Google) — candidate; Grok CLI (x.ai via superagent-ai/grok-cli) — candidate
  - **Chinese labs:** Kimi Code (Moonshot, kimi.com/code) — candidate; Qwen Code (Alibaba, qwen.ai/qwencode) — candidate; MiniMax Agent (agent.minimax.io) — **unknown: CLI availability unverified** (may be web-only; investigate before registering)
  - **Independents:** zerocode (ZeroClaw) — specced; OpenCode (opencode.ai) — candidate; OpenHands (openhands.dev) — candidate; Goose (Block) — candidate; Pi.dev — candidate
- **Fairness rules extended to the harness axis**: per-run single harness (no mixing); harness version pinned in the trial image and provenance; framework×harness support matrix validated at load (frameworks lacking a harness section fail fast — already specced); `bare` candidate as the universal baseline.
- **Model×harness interplay**: each harness section declares how the model registry injects models (env vars, flags, or provider config) so worker-model pluggability composes with harness pluggability.
- Per-harness onboarding discipline (same as providers/models): probe → bare smoke → eligible for matrices.

## Capabilities

### Modified Capabilities

- `eval-orchestration`: Headless invocation requirement becomes harness-registry-driven: the orchestrator selects a driver by harness id from the registry; adding a print-cli-shaped harness requires only a registry entry (flags/telemetry mapping), no new code.
- `candidate-registry`: Harness ids validated against the harness registry instead of a hardcoded enum.

## Impact

- New `config/harnesses.yaml` + zod schema; `HarnessId` becomes registry-driven (string validated at load) rather than a closed enum; trial image grows per-harness binaries (gated: only installed harnesses lengthen the image).
- `src/driver/` reorganizes around the three driver kinds; print-cli harnesses share one parameterized driver.
- Telemetry honesty: per-harness mapping declares which fields exist (cost reporting varies wildly); cost-source labels from the models change apply.
- Auth: every harness brings its own credential env var(s); `.env.example` + redaction list updated from the registry (single source).
- Sequencing: depends on add-zerocode-harness's SessionDriver extraction; implement print-cli generalization first (Gemini CLI and Codex are the cheapest second/third harnesses), ACP second, sdk-server last.

# Proposal: Explore a model aggregator (one key, many models)

## Why

Adding new worker models today means a **new provider account + API key per vendor**
(the Kimi / MiniMax / Qwen profiles are parked exactly on this — keys pending). An
**aggregator** (Fireworks, OpenRouter, or Requesty) exposes many models behind **one
API key and one base URL**, which would let us evaluate Kimi K2.7, MiniMax M3, and
Qwen 3.7 — and future models — with a single secret and no per-vendor signups.

This is an **explore** change: decide *whether*, and *which* aggregator, before
wiring profiles. The model-registry already supports it mechanically (a profile
declares `ANTHROPIC_BASE_URL` + an auth env var); the open questions are about
**fit**, not plumbing.

## What it explores

Evaluate Fireworks vs OpenRouter vs Requesty against the harness's hard requirements:

1. **Anthropic-compatible endpoint (gate).** The harness drives worker models
   *through* Claude Code via `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN` (the
   `claude-code` transport / slot-mapping path). The aggregator MUST expose an
   Anthropic-compatible `/v1/messages` endpoint — many offer only OpenAI-compatible
   `/v1/chat/completions`, which this transport can't use.
2. **Reproducibility / routing determinism (gate).** A benchmark needs the *same*
   backend every run. OpenRouter **routes across underlying providers** by default →
   nondeterministic (the repo already chose native endpoints over OpenRouter for this
   reason). Fireworks is single-provider; Requesty routes to a *named* provider
   (Fireworks / Alibaba). Determine how to pin a single provider per model.
3. **Model coverage + version pinning.** Each lists the three models under slightly
   different slugs/versions (e.g. Fireworks/OpenRouter "Qwen 3.7 **Plus**" vs
   Requesty "Qwen 3.7 **Max** via Alibaba") — confirm exact model parity and whether
   a version can be pinned for reproducibility.
4. **Pricing + cost-source.** $/Mtok in/out per model for the profile's `pricing`
   (so `profile-priced` cost works); aggregator markup vs native.
5. **Tool-call fidelity + protocol.** Verify tool calls / stream-json behave through
   Claude Code (the slot-mapping path), per the `model probe` + smoke discipline.

The three candidate models (per the request):
`kimi-k2p7-code`, `minimax-m3`, `qwen3p7-plus` (Fireworks) /
`moonshotai/kimi-k2.7-code`, `minimax/minimax-m3`, `qwen/qwen3.7-plus` (OpenRouter) /
`fireworks/kimi-k2.7-code`, `fireworks/minimax-m3`, `alibaba/qwen3.7-max` (Requesty).

## Capabilities

### Modified Capabilities

- `model-registry`: evaluate adding **aggregator-backed model profiles** (one shared
  key + base URL spanning multiple models), and the reproducibility rule that an
  aggregator used as a benchmark backend must resolve to a single, pinned provider —
  no run-to-run provider routing.

## Impact

- No code change required if an aggregator passes: it's `config/models.yaml` profiles
  (`transport: claude-code`, `ANTHROPIC_BASE_URL` = aggregator endpoint, auth env =
  one shared key) + the key in `.env.example` + redaction.
- Decision artifact: a recommendation (Fireworks / OpenRouter / Requesty / native)
  with the matrix below, plus probe + one cheap smoke per chosen model.
- Risk: an OpenAI-only aggregator is unusable by the current `claude-code` transport
  without an OpenAI-compatible transport (out of scope here — flag if it blocks).

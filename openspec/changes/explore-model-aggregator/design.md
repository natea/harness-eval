# Design: Evaluate a model aggregator

Mechanically trivial (the registry already injects `ANTHROPIC_BASE_URL` + an auth
env). The decision is fit. Evaluation matrix — fill from spikes:

| Dimension | Fireworks | OpenRouter | Requesty |
| --- | --- | --- | --- |
| Anthropic `/v1/messages` endpoint? (GATE) | verify | verify | verify |
| Routing determinism (GATE) | single-provider ✓ | **routes across providers** ✗ (pin via `provider.order`+`allow_fallbacks:false`) | routes to a *named* provider (Fireworks/Alibaba) ~ |
| One key spans the 3 models | yes | yes | yes |
| Model parity / version pin | k2p7-code, minimax-m3, qwen3p7-plus | same slugs | Qwen via Alibaba = **3.7 Max**, not Plus → not identical |
| $/Mtok (for `profile-priced`) | from model page | from model page | from model page |
| Tool-call / stream-json through Claude Code | probe | probe | probe |

## The two gates

1. **Anthropic-compatible.** The `claude-code` transport sets `ANTHROPIC_BASE_URL`
   and talks `/v1/messages`. An OpenAI-only aggregator can't be used without a new
   `openai-compatible` transport (out of scope). This is pass/fail per aggregator.
2. **Reproducibility.** A benchmark backend MUST resolve to one provider per run.
   OpenRouter's default cross-provider routing violates this (already the documented
   reason native endpoints were chosen) — only usable if pinned to a single provider
   with fallbacks disabled. Fireworks (single-provider) is the safest default;
   Requesty is deterministic only when its named-provider route is fixed.

## Provisional recommendation (confirm via spikes)

- **Fireworks** as the aggregator of record if it exposes an Anthropic-compatible
  endpoint: single key, single provider (deterministic), all three models.
- **OpenRouter** only with provider pinning + fallbacks off, and flagged for the
  routing caveat.
- **Requesty** viable but note the Qwen 3.7 **Max** (Alibaba) ≠ Plus version mismatch.
- **Native endpoints** remain the gold standard for reproducibility; the aggregator
  is a convenience for breadth, recorded in provenance as `provider: <aggregator>`
  with the underlying model pinned.

## Out of scope
- An OpenAI-compatible worker transport (only needed if no aggregator offers
  Anthropic-compat). Judge model unchanged (stays a pinned non-worker model).

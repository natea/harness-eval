# Capability: model-registry

## ADDED Requirements

### Requirement: Aggregator-backed model profiles are reproducibility-pinned
The system SHALL support sourcing models through an aggregator only when the aggregator can be pinned to a single, reproducible backend.
When a model is sourced through an aggregator (one shared key + base URL spanning
multiple models, e.g. Fireworks / OpenRouter / Requesty), the profile SHALL declare
the aggregator's Anthropic-compatible endpoint as `ANTHROPIC_BASE_URL` and the shared
key as its auth env, and SHALL resolve to a **single, pinned underlying provider** for
the run — an aggregator that routes across providers per request (e.g. OpenRouter's
default) SHALL be configured to a single provider with fallbacks disabled before use
as a benchmark backend. Provenance SHALL record the aggregator as the provider and the
pinned underlying model id, so a result is reproducible and not conflated across
backends.

#### Scenario: One key spans multiple models
- **WHEN** Kimi K2.7, MiniMax M3, and Qwen 3.7 are configured via one aggregator
- **THEN** a single shared API key + base URL resolves all three profiles with no
  per-vendor key, and each records the aggregator + pinned model id in provenance

#### Scenario: Cross-provider routing rejected as a benchmark backend
- **WHEN** an aggregator would route the same model across different underlying
  providers between runs
- **THEN** it SHALL be pinned to one provider (fallbacks off) before benchmark use, or
  flagged as non-reproducible — a benchmark backend resolves to one provider per run

#### Scenario: OpenAI-only aggregator is out of reach
- **WHEN** an aggregator exposes only an OpenAI-compatible endpoint
- **THEN** it is not usable by the current `claude-code` transport, and that gate
  failure is recorded (an OpenAI-compatible transport is separate, out-of-scope work)

# Tasks: Explore a model aggregator

## 1. Gate checks (per aggregator)
- [ ] 1.1 Confirm an Anthropic-compatible `/v1/messages` endpoint + base URL for
  Fireworks, OpenRouter, Requesty (pass/fail gate).
- [ ] 1.2 Determine single-provider pinning for reproducibility (OpenRouter
  `provider.order` + `allow_fallbacks:false`; Requesty named route; Fireworks n/a).

## 2. Spike one aggregator end-to-end
- [ ] 2.1 Add throwaway `config/models.yaml` profiles for kimi-k2.7 / minimax-m3 /
  qwen3.7 via the chosen aggregator (one shared key + base URL); key in
  `.env.example` + redaction.
- [ ] 2.2 `model probe <profile>` for each (1-token connectivity through Claude Code).
- [ ] 2.3 One cheap smoke trial per model; verify tool-call/stream-json fidelity and
  record `profile-priced` cost from the aggregator's pricing.

## 3. Decide
- [ ] 3.1 Fill the matrix; recommend aggregator-of-record (or native) with the
  reproducibility + version-parity caveats; capture in provenance/scorecard design.
- [ ] 3.2 `openspec validate explore-model-aggregator`.

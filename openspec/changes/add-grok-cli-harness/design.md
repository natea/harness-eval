# Design: Grok CLI harness driver

Builds on `add-pluggable-harnesses`. Verify against the pinned version at impl.

## Install / run
Pin the Grok CLI (npm, `superagent-ai/grok-cli`) in `infra/trial-image`. Headless:
the CLI's non-interactive prompt mode (e.g. `grok -p "<prompt>"`) in the workspace
cwd. No REPL.

## Model + auth
`GROK_API_KEY` (xAI) + the Grok model id, from the model registry. Grok-only.

## Telemetry
Map output to `SessionRecord`; cost `profile-priced` from Grok pricing or
`tokens-only`. File-redirect + read after exit.

## Harness↔model confound
Grok CLI is model-locked → a comparison vs Claude Code mixes harness + model. Record
provenance + a scorecard caveat; pure harness comparison only when all harnesses run
the same model.

## Open questions
- Exact package name + non-interactive flags + any machine-readable output for the
  pinned Grok CLI release.
- xAI auth + model id mapping in the sandbox.

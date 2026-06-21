# Design: Cline CLI harness driver

Builds on `add-pluggable-harnesses`. Verify against the pinned version at impl.

## Install / run
Pin the Cline CLI (npm) in `infra/trial-image`. Headless: the CLI's non-interactive
task mode (e.g. `cline task "<prompt>"`) in the workspace cwd. No REPL. Continuation
from the registry's content-free allowlist.

## Model + auth (fairness-critical)
Cline is BYOK / model-agnostic. Configure the provider+model to the run's pinned
worker model via env / Cline config, with the key from the model registry. Held fixed
across harnesses → fair comparison.

## Telemetry
Map output (JSON mode if supported) to `SessionRecord`; cost `harness-reported` if
emitted, else `profile-priced`/`tokens-only`. File-redirect + read after exit.

## Open questions
- Exact package name + non-interactive task flags + machine-readable output for the
  pinned Cline CLI release.
- Cline's config surface for non-interactive provider/model/key selection.

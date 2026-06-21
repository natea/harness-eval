# Design: Goose harness driver

Builds on the `HarnessDriver` contract from `add-pluggable-harnesses`. Goose-specific
details below — verify against the pinned version at implementation.

## Install
Pin a Goose CLI release in `infra/trial-image` (install script / binary); assert the
version like other pinned tools.

## Headless run
`goose run` non-interactively against the workspace cwd, rendered base prompt via
`--text "<prompt>"` or `-i <instructions-file>`. No interactive REPL. Continuation at
approval gates uses Goose session resume (`--name <id>`, then `--resume`), mapped onto
the registry's content-free continuation allowlist — never adding task hints.

## Model + auth (fairness-critical)
Configure Goose non-interactively to the run's **pinned worker model** via
`GOOSE_PROVIDER`/`GOOSE_MODEL` + the provider key resolved from the model registry, or
a pre-written `~/.config/goose/config.yaml`. No interactive `goose configure` in the
sandbox.

## Telemetry
Parse Goose's run output into `SessionRecord` (duration, tokens, cost, turns). Goose's
reporting is less structured than Claude Code's `result` JSON; capture what it emits
and fall back to `profile-priced` (model-registry pricing) or `tokens-only`. Redirect
output to a file and read after exit.

## Open questions (resolve at implementation)
- Exact `goose run` flags for true one-shot non-interactive execution and bounded
  continuation, against the pinned version.
- Whether Goose surfaces token/cost usage machine-readably.
- Canonical upstream: the user cited `aaif-goose/goose` + `goose-docs.ai`; confirm the
  install source and pin a specific release.

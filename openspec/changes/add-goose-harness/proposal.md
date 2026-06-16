# Proposal: Add Goose as an evaluatable harness

> Depends on **`add-pluggable-harnesses`** (the `HarnessDriver` contract +
> dispatch-by-`HarnessId`). This change contributes one driver.

## Why

[Goose](https://github.com/aaif-goose/goose) ([docs](https://goose-docs.ai/)) — the
open-source agent CLI by Block — is a strong first non-Claude harness for the
comparison: it runs fully from the terminal, supports one-shot non-interactive
tasks, and is model-agnostic, so it can drive the run's pinned worker model and keep
a cross-harness comparison fair.

## What Changes

- **Add `goose` to `HarnessId`** and register a **Goose `HarnessDriver`**:
  - **Install**: pinned Goose CLI in the trial image (install script / release
    binary), version-asserted.
  - **Headless run**: `goose run` non-interactively in the workspace, with the
    rendered base prompt via `--text "<prompt>"` or `-i <instructions-file>` (no
    REPL); continuation at gates via Goose session resume (`--name`/`--resume`)
    mapped onto the registry's content-free allowlist.
  - **Model + auth**: set Goose's provider+model to the run's pinned worker model
    (`GOOSE_PROVIDER`/`GOOSE_MODEL` + provider key from the model registry, or a
    pre-written `~/.config/goose/config.yaml` — no interactive `goose configure`).
  - **Telemetry**: map Goose's output to `SessionRecord`; cost via the harness-driver
    cost-source rule (`harness-reported` if Goose emits dollars, else `profile-priced`
    / `tokens-only`).
- **Candidate-registry**: candidates may add a `goose:` harness block (`install` +
  `session` + `continuation`), parallel to `claude-code:`; fairness rules unchanged.

## Capabilities

### Modified Capabilities

- `harness-drivers`: adds the Goose driver (install + headless `goose run` +
  telemetry mapping) to the pluggable harness set.

## Impact

- `HarnessId` gains `goose`; new Goose driver under `src/driver/harnesses/`; trial
  image gains a pinned Goose install (`infra/trial-image`).
- New provider key only if Goose needs one not already in the env allowlist → add to
  `.env.example` + archiver redaction.
- Cross-harness caveat: pin the same worker model across harnesses; Goose cost may be
  `tokens-only` and is surfaced as a cost-basis caveat.
- Before matrix use: a cheap probe (`goose run` 1-shot) + one smoke trial, same
  discipline as new providers/models.

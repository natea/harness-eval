## Context

`dcode` is LangChain's Deep Agents coding CLI: headless via `dcode -n "<prompt>"`,
model-agnostic (`--model provider:model`, auth via env / `~/.deepagents/.env`),
read/write files + shell, with `--max-turns`/`--timeout`/`-q`/`-S` controls. It fits
the existing print-cli driver pattern (a CLI that takes a prompt and writes output to
a file). The harness-drivers contract + the shared `resolveWorkerEnv` (codex
established the model-agnostic + transport path) make this a small, isolated driver.

## Goals / Non-Goals

**Goals:** a headless, model-agnostic `deepagents` harness driver that holds the
worker model fixed, with telemetry + cost-source + contract conformance.

**Non-Goals:** the interactive `dcode` UI; LangSmith-only telemetry; a non-CLI Python
API; changing orchestration/grading.

## Decisions

**1. Reuse the print-cli runner.** `dcode -n` takes a prompt and runs to completion;
redirect output to a sandbox file and read after exit (the daemon-stdout footgun
applies). `buildCommand` = `dcode -n` + `-q` + `--model <provider>:<model>` +
`--max-turns`/`--timeout` from the budget + a shell allow-list flag.

**2. Model via the shared resolver.** Map the worker profile to
`--model <provider>:<modelId>` and inject the provider's auth env var through the
shared `resolveWorkerEnv` (the same seam codex uses), adding a `deepagents` transport.
`dcode` is model-agnostic, so it can hold the model fixed; cross-model runs get the
ordinary harness+model caveat.

**3. Telemetry from the machine-readable surface.** Prefer a `--json`/event stream if
`dcode` exposes one; otherwise parse the per-thread transcript it writes under
`~/.deepagents/`. Map to `SessionRecord` (duration, tokens, turns); cost-source per
the harness-driver rule. **Confirm the exact output shape in the spike** (the one
real unknown).

**4. Contract conformance.** Add a `dcode` conformance fixture (captured output) so
the driver passes the shared contract suite — same gate every driver clears.

## Risks / Trade-offs

- **Output shape for telemetry** → spike `dcode -n -q` and the transcript files;
  parse whichever is stable; pin the version so the shape doesn't drift.
- **Auth/config dir** (`~/.deepagents/.env`) → inject per-trial via env into the
  sandbox HOME; never bake a key into the image (the worker-auth rule); the dir is
  per-trial isolated like CODEX_HOME.
- **`--max-turns`/`--timeout` vs. our budgets** → map the run's wall-clock/turn caps
  onto these flags so caps are enforced harness-side too.

## Open Questions

- Does `dcode` emit a `--json` event stream, or must telemetry come from the
  `~/.deepagents/` thread transcript?
- Exact `--model` provider tokens for our registry profiles (anthropic:…, openai:…).
- Auth precedence: env var vs. `~/.deepagents/.env` for headless, isolated runs.

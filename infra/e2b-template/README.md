# E2B trial template

The E2B provider needs a template mirroring `infra/trial-image/Dockerfile`
(Ubuntu 24.04, Node 22, system-wide Bun, git, Claude Code pinned — see the
Dockerfile for the authoritative toolchain).

One-time build (requires an E2B account and `E2B_API_KEY`):

1. `bunx e2b template init` in this directory.
2. Point the template at `../trial-image/Dockerfile` (or mirror it with the
   TS builder's `.fromBaseImage()` chain if the CLI version doesn't accept a
   Dockerfile directly).
3. Build/push; pin the resulting template tag as `snapshot` when running
   `--provider e2b` (or set it in config/run.defaults.yaml).

Preflight (`src/providers/e2b.ts`) probes the template with a short-lived
sandbox and validates the account tier's max lifetime against the trial
wall-clock budget before any trial is dispatched.

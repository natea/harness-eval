# Proposal: Explore SWE-ReX as a sandbox execution runtime

## Why

Every trial runs a build in a fresh isolated environment behind one
`SandboxProvider` (today: daytona, e2b, docker, macos-vz, worktree). Each provider
is a bespoke integration (provision, write file, exec, copy out, teardown, preflight,
secret injection), and matrix throughput/cost is bounded by how cheaply we can
provision and run many sandboxes in parallel.

[`SWE-agent/SWE-ReX`](https://github.com/SWE-agent/SWE-ReX) is the SWE-agent
project's **sandbox execution runtime**: one agent-agnostic interface over **local,
Docker, AWS Fargate, AWS EC2, Modal, and Daytona** backends, with persistent shell
sessions, automatic exit-code/output capture, and **proven massive parallelism**
(SWE-agent runs 30+ SWE-bench instances concurrently through it). It exposes a small
server API, so our Bun/TS orchestrator can drive it over HTTP without taking on
Python.

If SWE-ReX can back a `SandboxProvider`, one integration could give the eval several
backends at once — notably **cheap, massively-parallel serverless compute (Modal /
Fargate)** for matrix runs — instead of a bespoke provider per backend. This change
is a **feasibility exploration**: can SWE-ReX slot behind our `SandboxProvider`
contract, what does it actually buy (parallelism, cost, backend breadth), and is the
fit/maturity acceptable — ending in a go/no-go recommendation.

## What Changes

Scoped as **investigation + a thin spike + a recommendation**, not a production
provider:

- **Map SWE-ReX's runtime API to our `SandboxProvider` contract.** Confirm provision
  → run-command (exec with exit code) → write/read file → teardown can be expressed
  over SWE-ReX's shell-session API, and that our `claude-code` / `codex` CLIs can be
  installed and run inside its sandboxes.
- **Thin spike.** Drive one trial through a SWE-ReX-backed provider on its simplest
  backend (local/Docker): provision, run the cold-start contract (`setup.sh` then
  `start.sh`), run a harness session, capture telemetry, tear down with no leak.
- **Measure the payoff.** Provisioning time + concurrency vs. e2b/daytona; what
  Modal/Fargate would add for a 4×3 matrix; the TS↔Python(HTTP) boundary cost.
- **Recommendation.** Go/no-go on adopting a SWE-ReX-backed provider, which
  backend(s) it would unlock, and what a full build entails.

## Capabilities

### New Capabilities

- `swe-rex-provider`: a `SandboxProvider` backed by SWE-ReX — provision/exec/file/
  teardown mapped onto its runtime API, per-sandbox secret injection, preflight, and
  provenance recording the backend — validated by a spike with measured parallelism/
  cost. (Full build is a follow-up if the spike says go.)

## Impact

- **Spike code (throwaway-ok):** a `SandboxProvider` adapter that talks to SWE-ReX's
  server over HTTP; secret injection per sandbox; preflight for the chosen backend.
- **Boundary:** SWE-ReX is Python with an HTTP server — our TS orchestrator calls it
  over HTTP (no Python in-process); record the dependency + pinned version.
- **Invariants:** the `SandboxProvider` contract is unchanged; per-sandbox secret
  injection (never baked into an image/snapshot); results across providers stay
  flagged as not directly comparable.
- **Non-goals:** replacing existing providers; a production multi-backend build; using
  SWE-agent itself as a harness (this is about the *runtime*, not the agent).

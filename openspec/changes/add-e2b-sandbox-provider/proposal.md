# Proposal: Add E2B Sandbox Provider

## Why

Daytona is currently the only cloud isolation provider, and its free-tier 10GiB memory cap forces concurrency 1 for cloud runs (orchestrator 4GiB + one 4GiB trial). E2B (e2b.dev) offers Firecracker-microVM sandboxes with an equivalent SDK surface, separate quota pools, and per-second billing — an alternative that de-risks single-vendor dependence and may unlock cheaper or more parallel matrix runs.

## What Changes

- Add an `e2b` isolation provider implementing the existing `SandboxProvider` interface (provision, exec, copyOut, writeFile, destroy) using the E2B JS SDK (`Sandbox.create`, `commands.run`, `files.*`), authenticated via `E2B_API_KEY` from env.
- Build and pin an E2B sandbox template mirroring `harness-eval-base:v2` (Ubuntu, Node 22, Bun, git, Claude Code pinned at 2.1.170, uid-1000 user) via E2B's template builder.
- Extend sandbox lifetime beyond E2B's short default to cover multi-hour builds; surface tier lifetime caps (Hobby ~1h max sandbox lifetime) as a provider-validation error before dispatch, not a mid-build death.
- Extend `RunConfig`/provenance provider enums with `e2b`; provider recorded per trial as today (results across providers remain flagged non-comparable).
- Document provider selection (`--provider e2b`) and template build/pin procedure in `infra/`.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `eval-orchestration`: Trial isolation requirement gains E2B as a third provider behind the same `SandboxProvider` interface, with provider-specific preflight validation (template exists, lifetime budget fits tier cap).

## Impact

- New dependency: `e2b` JS SDK; new secret `E2B_API_KEY` (env-only, added to `.env.example` and redaction list).
- `src/providers/` gains `e2b.ts`; `src/types.ts` provider enums widen; CLI `--provider` accepts `e2b`.
- New template definition under `infra/e2b-template/`; one-time `e2b` CLI/template build step.
- No changes to candidate registry, grading, or reporting — isolation is fully abstracted behind `SandboxProvider`.
- Cost exposure: E2B bills per second of sandbox runtime; tier limits (8GB RAM, sandbox-lifetime caps) must be validated against trial budgets at run start.

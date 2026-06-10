# Design: E2B Sandbox Provider

## Context

The `SandboxProvider` interface (`src/providers/types.ts`) already abstracts isolation: Daytona (cloud) and git-worktree (local fallback) implement provision/exec/copyOut/writeFile/destroy. The Daytona experience surfaced provider-specific landmines worth designing for up front: uid mismatches between image user and the provider's agent daemon, env propagation through pipelines, auto-stop/lifetime policies killing long unattended work, and org-tier resource caps capping concurrency. E2B: Firecracker microVM sandboxes, JS SDK (`Sandbox.create("template")`, `sbx.commands.run()`, `sbx.files.write/read`), `E2B_API_KEY` auth, templates built from a base image via E2B's template builder, short default sandbox lifetime that must be explicitly extended, tier caps (Hobby: 8GB RAM, ~1h max sandbox lifetime; Pro: longer).

## Goals / Non-Goals

**Goals:**
- Drop-in third provider: `--provider e2b` with zero changes to registry, driver, grading, or reporting.
- Template parity with `harness-eval-base:v2` so artifacts are environment-comparable across cloud providers.
- Fail-before-spend: preflight validation that the template exists and the trial wall-clock budget fits the account tier's sandbox-lifetime cap.

**Non-Goals:**
- Self-hosting E2B's open-source infra (requires Linux/KVM cluster via Terraform — heavyweight; and on macOS laptops Firecracker can't run natively at all, so this is not a local-execution path; see `add-docker-local-provider` for that).
- Cross-provider score comparison (existing rule stands: provider recorded in provenance; mixed-provider results flagged non-comparable).
- Migrating the cloud orchestrator pattern to E2B in this change (orchestrator-in-sandbox stays Daytona; E2B sandboxes are trial workers only).

## Decisions

- **D1 — Implement against the core `e2b` SDK, not `@e2b/code-interpreter`.** The code-interpreter package layers a Python/Jupyter REPL we don't need; trials need shell exec + file IO only. The provider maps: provision → `Sandbox.create(template, { timeoutMs })`; exec → `sbx.commands.run(cmd, { cwd, envs, timeoutMs })`; writeFile → `sbx.files.write`; copyOut → in-sandbox `tar` then `sbx.files.read` of the tarball (mirrors the Daytona pattern); destroy → `sbx.kill()`.
- **D2 — Lifetime management is explicit.** Create with `timeoutMs` = trial wall-clock budget + setup margin; call the SDK's lifetime-extension API (`setTimeout`) between session steps as a heartbeat. If the account tier's max lifetime < trial budget, fail at preflight with a clear message naming the tier cap (lesson from Daytona auto-stop: never let a policy kill a build mid-flight).
- **D3 — Template defined in-repo under `infra/e2b-template/`** using E2B's TS template builder (`.fromBaseImage()` chain) pinned to the same Ubuntu/Node 22/Bun/Claude Code 2.1.170 stack, built/pushed via a documented one-time command; the built template tag is pinned in `config/run.defaults.yaml` (`e2bTemplate`). uid-1000 normal user, mirroring the Daytona uid lesson.
- **D4 — Env propagation uses the SDK's `envs` parameter per command** (E2B supports per-exec envs natively) instead of Daytona's `bash -lc` export wrapping; the worker-auth pass-through (`CLAUDE_CODE_OAUTH_TOKEN`/`ANTHROPIC_API_KEY`) flows through the same `ExecOptions.env` path as today.

## Risks / Trade-offs

- [Hobby-tier ~1h sandbox lifetime < 2h trial budget] → preflight hard-fail with tier guidance; document that matrix runs on E2B effectively require Pro tier or reduced trial budgets.
- [E2B default short timeout silently killing idle sandboxes between long session steps] → heartbeat extension in the session executor loop (D2); trial marked `infra-failed` (retryable) if a sandbox dies anyway.
- [Template drift vs Daytona snapshot] → single source of truth for the toolchain (one Dockerfile/builder definition consumed by both providers where practical); template tag + Claude Code version recorded in provenance per trial.
- [Per-second billing surprises during long builds] → existing per-trial wall-clock caps bound cost; provider docs note expected $/trial at current E2B pricing.
- [SDK exec output buffering limits on large transcripts] → session output already goes to a file in the sandbox (daemon-pipe lesson); only the file read-back crosses the SDK.

## Open Questions

- Which E2B tier is available on the user's account (determines whether 2h trial budgets are even admissible)?
- Whether E2B's template builder can consume the existing Dockerfile directly (preferred) or needs a parallel builder-DSL definition kept in sync.

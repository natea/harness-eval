# Design: Trial Artifact Audit + Live Demos

## Context

A completed trial archives its built app to
`runs/<runId>/trials/<trialId>/workspace/` plus `provenance.json`, `grades.json`,
and scrubbed `workspace-blind/`. The target's manifest declares a **cold-start
contract** (`coldStartContract`) — e.g. `setup.sh` installs deps, `start.sh`
launches on `$PORT`. The grading evaluator already boots web targets against
fixtures, so "run the built app" is a known-good operation; this capability makes
it a first-class, on-demand, isolated demo with a URL.

## Goals / Non-Goals

- **Goals:** read-only artifact audit per trial; on-demand isolated demo with a
  clickable URL; pluggable routing (port / portless); safe lifecycle; never
  mutate the archive.
- **Non-Goals:** public/remote hosting; always-on demos; cross-trial artifact
  diffing; re-grading.

## Decisions

### 1. Run from a copy, in a sandbox, never the archive

A preview NEVER runs in `runs/.../workspace` (the gitignored ground truth that
must not be mutated — installs write `node_modules`, builds write `dist`).
Instead the launcher copies the archived workspace into an ephemeral preview dir
(or into a provisioned sandbox), runs the cold-start there, and tears it down on
stop.

Execution is **isolated by default** via the existing `SandboxProvider`
abstraction:

- **docker** (default for previews): provision a container, copy the workspace
  in, run `setup.sh` then `start.sh` with an injected `PORT`, map the port out.
  Real isolation for agent-generated code; local; port-mappable.
- **worktree/host** (explicit opt-in, `--unsafe-host`): run on the host bound to
  localhost. Faster, no container, but runs untrusted code directly — allowed
  only with a recorded trust acknowledgement, for local review of your own runs.

The provider choice is recorded with the preview so the trust posture is auditable.

### 2. Pluggable preview router: port vs portless

A `PreviewRouter` interface returns a reachable URL for a started backend:

```ts
interface PreviewRouter {
  // Given a preview id + the backend's host:port, return a demo URL and register routing.
  expose(previewId: string, backend: { host: string; port: number }): Promise<{ url: string }>;
  release(previewId: string): Promise<void>;
}
```

- **PortRouter (default, zero-dep):** allocate a free ephemeral port, map the
  backend to it, return `http://localhost:<port>`. Simplest; no external tooling.
- **PortlessRouter (opt-in):** register the backend with the portless proxy under
  a stable name `<runId>-<trialId>` (sanitized) via `portless alias <name> <port>`
  (for an already-running backend) so the demo URL is
  `https://<run>-<trial>.localhost` — stable, human/agent friendly, no port
  juggling. Requires the portless proxy available locally; the router probes for
  it and falls back to PortRouter with a logged note if absent.

The router is selected by config (`preview.router: port | portless`).

### 3. Cold-start health check defines "ready"

After `start.sh`, the launcher polls the mapped URL until it responds (HTTP < 500)
within the target's cold-start budget, then marks the preview `ready` and returns
the URL. If it never becomes healthy, the preview is `failed` with the captured
`setup.sh`/`start.sh` logs surfaced in the audit panel (this is itself useful
audit signal — "the build doesn't cold-start cleanly").

### 4. Target-kind adaptation

Not every target is a web app:

- **web/HTTP targets** (manifest `ui: true` or a declared HTTP server in the
  cold-start contract): full live demo with a URL.
- **CLI / daemon targets** (e.g. `cli-tool`, `symphony-daemon`): no web URL.
  The "demo" is a **captured cold-start run** — run `setup.sh` + a declared
  sample invocation, capture stdout/exit, and show it in the audit panel. The
  artifact audit (files, contract, logs, grades) is always available regardless.

### 5. Lifecycle + limits

`previews` are tracked like studio jobs: `starting → ready | failed → stopped`.

- **On-demand:** started from the studio (or a CLI verb), not eagerly.
- **Idle auto-stop:** a preview with no traffic for N minutes is torn down.
- **Explicit stop:** a Stop control; tears down the sandbox/process + router route.
- **Concurrency cap:** at most K concurrent previews (each holds a container/port).
- **Localhost bind:** PortRouter binds localhost; portless is localhost by design.
- **No leaks:** stop/idle/crash all run teardown (container destroy + `release`),
  consistent with the live-run cancel discipline.

### 6. Artifact audit (read-only)

An inventory reader walks the archived trial and returns, without mutation:
file tree (paths + sizes, excluding `node_modules`/`.git`), the cold-start
contract from the manifest, presence of `workspace-blind`, the grades summary,
and any captured preview logs. The studio renders this as the **Artifacts** panel
on the trial drill-down; the demo control lives alongside it.

## Risks / Trade-offs

- **Running untrusted code** — mitigated by sandbox-by-default + explicit
  `--unsafe-host` opt-in + localhost bind. The trust posture is recorded.
- **portless availability** — it's an external proxy; the router probes and falls
  back to ports with a logged note, so a missing portless never breaks demos.
- **Resource use** — each demo holds a container + port; the concurrency cap and
  idle auto-stop bound it. Logged when a start is refused at the cap (no silent drop).
- **Cold-start cost** — `setup.sh` can be slow (npm install); the audit shows a
  spinner + the live setup log, reusing the live-run stage-indicator pattern.

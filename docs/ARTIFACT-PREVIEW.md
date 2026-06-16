# Trial Artifact Audit + Live Demos

Every completed trial archives a real, runnable deliverable to
`runs/<run-id>/trials/<trial-id>/workspace/`. This feature makes that artifact
**auditable** (a read-only inventory) and **demoable** (boot it on-demand behind
a URL), without ever mutating the archive.

## In the studio

Open a trial drill-down (`/runs/<run-id>/trials/<trial-id>`). The **Artifacts**
panel shows:

- the built file tree (paths + sizes, excluding `node_modules`/`.git`/`dist`),
- the target's cold-start contract and whether `setup.sh`/`start.sh` were written,
- whether the framework-marker-scrubbed `workspace-blind` copy is present,
- the recorded grades summary.

Alongside it, the **Demo** control:

- **Web targets** (`ui: true`) → **Start demo** boots the app and links a live
  URL once it passes its cold-start health check.
- **Non-web targets** (CLI/daemon) → **Run cold-start** runs the contract and
  captures the output (no URL).

## How a demo runs

A preview NEVER runs in `runs/.../workspace` (the immutable archive). The
launcher copies the workspace to an ephemeral location, runs `setup.sh` then
`start.sh` (with an injected `PORT`), health-checks the app, and routes it to a
URL. On stop / idle / shutdown the app and its route are torn down — no leaks.

### Isolation (trust posture)

- **Sandboxed (default):** runs inside a Docker container with the app port
  published to a **localhost** host port. Agent-generated code is isolated.
- **Host (`--unsafe-host`, opt-in):** runs on the host bound to localhost.
  Faster, no container — but runs untrusted code directly. Only for trusted
  local review of your own runs; the trust posture is recorded with the preview.

### Routing: `port` vs `portless`

Selected by config (`preview.router`):

- **`port` (default, zero-dependency):** the mapped host port *is* the route →
  `http://localhost:<port>`.
- **`portless` (opt-in):** registers a stable `https://<run>-<trial>.localhost`
  alias via the [portless](https://github.com/vercel-labs/portless) proxy — no
  port juggling. The router probes for `portless`; if it's not installed it
  **falls back to port routing with a logged note**, so a missing proxy never
  breaks demos.

## Lifecycle & limits

- Previews are tracked `starting → ready | failed → stopped`.
- **Idle auto-stop:** a preview with no access for ~15 min is torn down.
- **Concurrency cap:** at most 3 simultaneous previews (each holds a
  container/port). A start refused at the cap is **logged, not silently dropped**.
- **Localhost bind** is enforced; previews are never exposed off-host.

## API

- `GET /api/runs/:id/trials/:trialId/inventory` — read-only artifact audit.
- `POST /api/preview/start` `{ runId, trialId, unsafeHost?, router? }` — start.
- `POST /api/preview/stop` `{ runId, trialId }` — stop (teardown + route release).
- `GET /api/preview/list` — running previews.

## Safety summary

- Previews **never write into the archived workspace** (verified by test).
- Host execution requires the explicit `--unsafe-host` opt-in and is recorded.
- A build that won't cold-start cleanly shows as `failed` with its captured
  `setup.sh`/`start.sh` logs — itself useful audit signal.

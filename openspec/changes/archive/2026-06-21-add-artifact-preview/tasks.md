# Tasks: Trial Artifact Audit + Live Demos

## 1. Artifact inventory (read-only audit)

- [x] 1.1 Inventory reader: walk an archived trial without mutation — file tree
  (paths + sizes, excluding `node_modules`/`.git`/`dist`), the manifest cold-start
  contract, `workspace-blind` presence, and the grades summary
- [x] 1.2 Expose the inventory via the studio (`/api/runs/:id/trials/:trialId`
  augmentation or a dedicated audit endpoint), reads only

## 2. Preview launcher (run from a copy, isolated)

- [x] 2.1 Copy the archived workspace to an ephemeral preview location (never run
  in `runs/.../workspace`); tear it down on stop
- [x] 2.2 Run the cold-start contract (`setup.sh` then `start.sh` with injected
  `PORT`) inside a `SandboxProvider` — **docker by default**; capture setup/start logs
- [x] 2.3 Host execution opt-in (`--unsafe-host`): run on the host bound to
  localhost, only with a recorded trust acknowledgement; record the provider/trust
  posture with the preview
- [x] 2.4 Cold-start health check: poll until healthy within the target budget →
  `ready`; otherwise `failed` with the captured logs surfaced

## 3. Pluggable routing (port / portless)

- [x] 3.1 `PreviewRouter` interface (`expose`/`release`) returning a demo URL
- [x] 3.2 `PortRouter` (default): allocate a free ephemeral port → `http://localhost:<port>`
- [x] 3.3 `PortlessRouter` (opt-in): register `<run>-<trial>` with the portless
  proxy (`portless alias <name> <port>`) → `https://<run>-<trial>.localhost`; probe
  for portless and fall back to `PortRouter` with a logged note if absent
- [x] 3.4 Select the router by config (`preview.router: port | portless`)

## 4. Lifecycle + limits

- [x] 4.1 Track previews (`starting → ready | failed → stopped`) with start time,
  target, provider, trust posture, and URL
- [x] 4.2 Explicit stop + idle auto-stop (no traffic for N min); teardown destroys
  the sandbox/process AND releases the router route — no leaks
- [x] 4.3 Concurrency cap on simultaneous previews; refuse-at-cap is logged, not
  silently dropped; localhost bind enforced

## 5. Target-kind adaptation

- [x] 5.1 Web/HTTP targets → live demo URL
- [x] 5.2 Non-web targets (CLI/daemon) → captured cold-start run (sample
  invocation: stdout + exit) instead of a URL; audit always available

## 6. Studio integration

- [x] 6.1 Trial drill-down: an **Artifacts** audit panel (file tree, cold-start
  contract, logs, grades)
- [x] 6.2 A **Demo** control that starts/stops a preview and links the live URL,
  with a readiness spinner reusing the live-run stage-indicator pattern

## 7. Validation

- [x] 7.1 Unit: inventory reader (no mutation; excludes vendored dirs); `PortRouter`
  URL allocation; `PortlessRouter` name sanitization + fallback-when-absent
- [x] 7.2 Integration (no spend): preview a fixture workspace with a tiny HTTP
  server end-to-end (copy → cold-start in a provider → health check → URL reachable
  → stop tears down with no leak)
- [x] 7.3 Safety: preview never writes into the archived `runs/.../workspace`;
  host execution requires the explicit opt-in
- [x] 7.4 Docs: how to demo a trial, the `port` vs `portless` routers, and the
  sandbox-by-default / `--unsafe-host` trust model

# Tasks: Trial Artifact Audit + Live Demos

## 1. Artifact inventory (read-only audit)

- [ ] 1.1 Inventory reader: walk an archived trial without mutation — file tree
  (paths + sizes, excluding `node_modules`/`.git`/`dist`), the manifest cold-start
  contract, `workspace-blind` presence, and the grades summary
- [ ] 1.2 Expose the inventory via the studio (`/api/runs/:id/trials/:trialId`
  augmentation or a dedicated audit endpoint), reads only

## 2. Preview launcher (run from a copy, isolated)

- [ ] 2.1 Copy the archived workspace to an ephemeral preview location (never run
  in `runs/.../workspace`); tear it down on stop
- [ ] 2.2 Run the cold-start contract (`setup.sh` then `start.sh` with injected
  `PORT`) inside a `SandboxProvider` — **docker by default**; capture setup/start logs
- [ ] 2.3 Host execution opt-in (`--unsafe-host`): run on the host bound to
  localhost, only with a recorded trust acknowledgement; record the provider/trust
  posture with the preview
- [ ] 2.4 Cold-start health check: poll until healthy within the target budget →
  `ready`; otherwise `failed` with the captured logs surfaced

## 3. Pluggable routing (port / portless)

- [ ] 3.1 `PreviewRouter` interface (`expose`/`release`) returning a demo URL
- [ ] 3.2 `PortRouter` (default): allocate a free ephemeral port → `http://localhost:<port>`
- [ ] 3.3 `PortlessRouter` (opt-in): register `<run>-<trial>` with the portless
  proxy (`portless alias <name> <port>`) → `https://<run>-<trial>.localhost`; probe
  for portless and fall back to `PortRouter` with a logged note if absent
- [ ] 3.4 Select the router by config (`preview.router: port | portless`)

## 4. Lifecycle + limits

- [ ] 4.1 Track previews (`starting → ready | failed → stopped`) with start time,
  target, provider, trust posture, and URL
- [ ] 4.2 Explicit stop + idle auto-stop (no traffic for N min); teardown destroys
  the sandbox/process AND releases the router route — no leaks
- [ ] 4.3 Concurrency cap on simultaneous previews; refuse-at-cap is logged, not
  silently dropped; localhost bind enforced

## 5. Target-kind adaptation

- [ ] 5.1 Web/HTTP targets → live demo URL
- [ ] 5.2 Non-web targets (CLI/daemon) → captured cold-start run (sample
  invocation: stdout + exit) instead of a URL; audit always available

## 6. Studio integration

- [ ] 6.1 Trial drill-down: an **Artifacts** audit panel (file tree, cold-start
  contract, logs, grades)
- [ ] 6.2 A **Demo** control that starts/stops a preview and links the live URL,
  with a readiness spinner reusing the live-run stage-indicator pattern

## 7. Validation

- [ ] 7.1 Unit: inventory reader (no mutation; excludes vendored dirs); `PortRouter`
  URL allocation; `PortlessRouter` name sanitization + fallback-when-absent
- [ ] 7.2 Integration (no spend): preview a fixture workspace with a tiny HTTP
  server end-to-end (copy → cold-start in a provider → health check → URL reachable
  → stop tears down with no leak)
- [ ] 7.3 Safety: preview never writes into the archived `runs/.../workspace`;
  host execution requires the explicit opt-in
- [ ] 7.4 Docs: how to demo a trial, the `port` vs `portless` routers, and the
  sandbox-by-default / `--unsafe-host` trust model

# macOS Virtualization Provider Setup (Apple Silicon)

The `macos-vz` provider runs each trial in its own lightweight Linux VM via
Apple's open-source [Containerization](https://github.com/apple/container)
framework (`container` CLI) on Virtualization.framework. Compared to Docker
Desktop: per-trial kernel isolation instead of one shared VM, no Docker
Desktop install/licensing, sub-second VM boot.

Verified on macOS 26.3.1 / container CLI 0.7.1 (2026-06-11). Provider
minimum: `0.5.0` (`MIN_CONTAINER_CLI` in `src/providers/macos-vz.ts`).

## One-time setup

```sh
# 1. Install the CLI (Homebrew core formula)
brew install container

# 2. Start system services. First start prompts to download the default
#    Linux kernel (kata-containers ~arm64) — answer Y.
container system start

# 3. Verify
container system status     # apiserver is running
container --version         # >= 0.5.0
```

## Trial image

Build with Docker once (shared definition for all providers), then load into
`container` — no registry needed:

```sh
docker build -t harness-eval-trial:zerocode infra/trial-image/
docker save harness-eval-trial:zerocode -o /tmp/trial-image.tar
container image load -i /tmp/trial-image.tar
container image list        # harness-eval-trial  zerocode
```

(If you don't use Docker at all, `container build -t harness-eval-trial:zerocode infra/trial-image/`
builds natively.)

## Run trials

```sh
bun run src/cli.ts run --candidates superpowers --trials 1 \
  --provider macos-vz --snapshot harness-eval-trial:zerocode
```

Preflight checks (fail-before-spend): Apple Silicon + CLI version ≥ pin +
`container system status` healthy + image present, with remediation messages
for each.

## CLI quirks the provider absorbs (v0.7.x)

- **No `cp` verb** — file transfer uses exec-channel base64 streaming
  (`execCopy: true` in the verb table). Fine for SPEC.md-sized inputs and
  workspace archives; very large artifacts pay a ~33% base64 overhead.
- **Health check is `container system status`**, not `info`.
- **Memory flags are separate tokens** (`--memory 4g`, not `--memory=4g`).
- VM memory is committed up-front (less elastic than Docker cgroup limits):
  watch `memoryGb × concurrency` against host RAM; preflight warns at >80%.

## Useful commands

```sh
# List running trial VMs (each gets its own IP via NAT)
container list
# ID                 IMAGE                                           OS     ARCH   STATE    ADDR           CPUS  MEMORY
# he-superpowers-t1  docker.io/library/harness-eval-trial:zerocode  linux  arm64  running  192.168.64.13  2     4096 MB

container list --all              # include stopped VMs
container image list              # loaded images
container logs he-superpowers-t1  # VM console logs
container exec -it he-superpowers-t1 bash   # shell into a running trial VM
container stats                   # live CPU/memory per VM
container delete -f he-<trial-id> # force-remove one trial VM
container system status           # daemon health
```

## Teardown / cleanup

```sh
bun run src/cli.ts cleanup        # removes orphaned he-* containers/VMs
container system stop             # stop services when not in use
```

## Troubleshooting: wedged VMs / the whole `container` CLI hangs

**Symptom.** `container delete -f`, `container stop`, `container kill`, and even
`container system stop` all hang and never return; `container list` keeps
showing trial VMs in `running` state. The memory (`memoryGb × N`) is never
freed.

**Why it happens.** Each trial VM runs a guest `vminitd` init that the host
`container-runtime-linux` helper drives over a vsock gRPC channel; the
`apiserver` brokers every CLI command to that helper via XPC. Teardown asks the
runtime to signal the guest and **waits for the guest to acknowledge process
exit**. If the guest is unresponsive, that ack never comes and the command
blocks. Common causes, in order of likelihood here:

1. **An agent-built daemon holds a channel open.** The trial's agent starts the
   app it built (a server with `start.sh`) and it inherits the exec/stdout
   stream — the same hazard behind the "redirect headless output to a file"
   rule. The runtime can't observe a clean exit, so `delete -f` waits forever.
2. **Guest OOM/stall.** macos-vz commits VM memory up-front; under host memory
   pressure a guest can stall and stop answering vsock.
3. **Broken vsock / crashed runtime helper.**

Crucially, once one teardown is stuck on a wedged runtime, the **apiserver
serializes later operations behind it** — so `list` / `stop` / `system stop`
queue up and the entire CLI appears frozen. `container system stop` does a
graceful "stopping containers" pass first, so it inherits the same hang.

This is an `apple/container` 0.x rough edge (young runtime), not a harness bug —
but the harness's `destroy()`/`cleanup` should survive it (see
`harden-container-teardown`).

**Diagnose first (each call is itself bounded — Ctrl-C if it hangs):**

```sh
container system logs | tail -20            # apiserver/runtime helper activity
container logs --boot he-<trial-id>         # guest kernel + vminitd boot log
```

**Recovery — escalation ladder (stop at the first that frees the VM):**

```sh
# 1. Bounded graceful, then force, via the CLI. Run with a timeout so a hang
#    doesn't trap you; if it returns, you're done.
container kill --all            # SIGKILL guests, bypasses graceful wait
container delete --all --force  # remove the (now-dead) container records

# 2. If those hang, the apiserver is poisoned — go OS-level. Find the trial's
#    runtime helper(s); each is named with its container uuid:
ps -axo pid,lstart,command | grep 'container-runtime-linux .*--uuid he-'
#    …and the paired guest VM processes (match by START time to the trials):
ps -axo pid,lstart,command | grep 'Virtualization.VirtualMachine'

# 3. SIGKILL the he-* runtime helpers AND their paired VM processes:
kill -9 <runtime-pids> <vm-pids>
#    ⚠ ONLY the he-* trials. A Virtualization.VirtualMachine with an OLD start
#    time (days ago) or no he-* files open (`lsof -p <pid> | grep he-`) belongs
#    to some OTHER app — do NOT kill it.

# 4. Kill any stuck CLI invocations still holding the apiserver lock:
ps -axo pid,command | grep -E 'container (delete|stop|kill)'   # kill -9 those

# 5. If the CLI is still confused, bounce the daemon (now unblocked) and verify:
container system stop && container system start
container list                 # should be empty; memory is freed
container system status        # apiserver is running
```

`bun run src/cli.ts cleanup` performs steps 1–4 for every orphaned `he-*` VM
automatically; reach for the manual ladder only if the daemon itself is wedged.

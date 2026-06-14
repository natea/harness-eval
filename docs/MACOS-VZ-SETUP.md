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
docker build -t harness-eval-trial:2.1.170-1 infra/trial-image/
docker save harness-eval-trial:2.1.170-1 -o /tmp/trial-image.tar
container image load -i /tmp/trial-image.tar
container image list        # harness-eval-trial  2.1.170-1
```

(If you don't use Docker at all, `container build -t harness-eval-trial:2.1.170-1 infra/trial-image/`
builds natively.)

## Run trials

```sh
bun run src/cli.ts run --candidates superpowers --trials 1 \
  --provider macos-vz --snapshot harness-eval-trial:2.1.170-1
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
# he-superpowers-t1  docker.io/library/harness-eval-trial:2.1.170-1  linux  arm64  running  192.168.64.13  2     4096 MB

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

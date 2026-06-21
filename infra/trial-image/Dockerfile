# Shared trial-environment image for ALL isolation providers.
# Local (docker / macos-vz):
#   docker build -t harness-eval-trial:2.1.170-1 infra/trial-image/
# Daytona snapshot:
#   daytona snapshot create harness-eval-base:v2 -f infra/trial-image/Dockerfile --cpu 2 --memory 4 --disk 10
# Pin the resulting tag/snapshot in config/run.defaults.yaml.
FROM ubuntu:24.04

# Retry hardening: trial builds must survive flaky links.
RUN echo 'Acquire::Retries "5";' > /etc/apt/apt.conf.d/80-retries \
    && echo 'Acquire::http::Timeout "30";' >> /etc/apt/apt.conf.d/80-retries

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git unzip ripgrep jq tar python3 \
    && rm -rf /var/lib/apt/lists/*

# Node 22 (GSD installer needs Node 18+)
RUN curl -fsSL --retry 5 https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs && rm -rf /var/lib/apt/lists/*

# Bun — system-wide so the uid-1000 trial user can run it
RUN curl -fsSL --retry 5 -o /tmp/bun-install.sh https://bun.sh/install \
    && BUN_INSTALL=/usr/local bash /tmp/bun-install.sh && rm /tmp/bun-install.sh

# Claude Code — PINNED. Keep in sync with config/run.defaults.yaml.
ARG CLAUDE_CODE_VERSION=2.1.170
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}

# Codex CLI — PINNED. Keep in sync with config/harnesses.yaml (codex driver).
ARG CODEX_VERSION=0.50.0
RUN npm install -g @openai/codex@${CODEX_VERSION} \
    && codex --version

# ZeroClaw (zerocode harness) — PINNED. The release tarball ships the `zeroclaw`
# (daemon/ACP/CLI) and `zerocode` (TUI) binaries at its root, plus a web bundle.
# Asset names are `zeroclaw-<rust-triple>.tar.gz` (NO version in the filename) —
# verified against the v0.8.1 release (add-zerocode-harness tasks 1.1/1.2). Re-pin
# the ACP protocol in src/driver/zeroclaw.ts (ACP_PROTOCOL_VERSION) on any bump.
ARG ZEROCLAW_VERSION=0.8.1
RUN arch="$(dpkg --print-architecture)" \
    && case "$arch" in \
         amd64) zc_arch=x86_64-unknown-linux-gnu ;; \
         arm64) zc_arch=aarch64-unknown-linux-gnu ;; \
         *) echo "unsupported arch: $arch" >&2; exit 1 ;; \
       esac \
    && curl -fsSL --retry 5 -o /tmp/zeroclaw.tar.gz \
       "https://github.com/zeroclaw-labs/zeroclaw/releases/download/v${ZEROCLAW_VERSION}/zeroclaw-${zc_arch}.tar.gz" \
    && tar -xzf /tmp/zeroclaw.tar.gz -C /usr/local/bin zeroclaw zerocode \
    && rm -f /tmp/zeroclaw.tar.gz \
    && chmod +x /usr/local/bin/zeroclaw /usr/local/bin/zerocode \
    && zeroclaw --version

# Headless ACP client (bun) the zerocode driver invokes per trial: it spawns
# `zeroclaw acp` (JSON-RPC 2.0 over stdio), drives initialize → session/new →
# session/prompt → session/stop, and echoes the wire transcript as JSONL.
COPY zeroclaw-acp-client.ts /opt/zeroclaw/acp-client.ts
# Secret-free trial config: the `trial` agent + a full-auto risk profile. The
# driver copies it per trial, pins the model, and injects the credential via the
# ZEROCLAW_…__api_key env-override (Max subscription token or API key) at runtime.
COPY zeroclaw-trial-config.toml /opt/zeroclaw/trial-config.toml

# Daytona's toolbox daemon runs as uid 1000 — use the base image's
# built-in 'ubuntu' user (uid 1000) so exec/upload share the workspace owner.
RUN mkdir -p /home/ubuntu/workspace && chown -R ubuntu:ubuntu /home/ubuntu
USER ubuntu
WORKDIR /home/ubuntu/workspace

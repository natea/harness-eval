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

# Daytona's toolbox daemon runs as uid 1000 — use the base image's
# built-in 'ubuntu' user (uid 1000) so exec/upload share the workspace owner.
RUN mkdir -p /home/ubuntu/workspace && chown -R ubuntu:ubuntu /home/ubuntu
USER ubuntu
WORKDIR /home/ubuntu/workspace

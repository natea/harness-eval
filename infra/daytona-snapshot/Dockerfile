# Daytona snapshot for harness-eval trials.
# Build & register (requires daytona CLI auth):
#   daytona snapshot create harness-eval-base:v1 --dockerfile infra/daytona-snapshot/Dockerfile
# Pin the resulting snapshot name in the run config (provider.snapshotId).
FROM ubuntu:24.04

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git unzip ripgrep jq tar python3 \
    && rm -rf /var/lib/apt/lists/*

# Node 22 (GSD installer needs Node 18+)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs && rm -rf /var/lib/apt/lists/*

# Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# Claude Code — PINNED. Keep in sync with design.md open question (default 2.1.170).
ARG CLAUDE_CODE_VERSION=2.1.170
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}

# Daytona's toolbox daemon runs as uid 1000 — use the base image's
# built-in 'ubuntu' user (uid 1000) so exec/upload share the workspace owner.
RUN mkdir -p /home/ubuntu/workspace && chown -R ubuntu:ubuntu /home/ubuntu
USER ubuntu
WORKDIR /home/ubuntu/workspace

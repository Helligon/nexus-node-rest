# Sandbox for one Shelfwright build: Node 24, git and the Claude Code CLI. Nothing from evaluator/.
FROM node:24-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g @anthropic-ai/claude-code@2.1.286
RUN git config --system --add safe.directory /work
USER node
WORKDIR /work

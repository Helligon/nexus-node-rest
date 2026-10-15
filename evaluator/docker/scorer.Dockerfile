# Runs deterministic checks and the scorer agent against one build. Holds the hidden oracle.
FROM node:24-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && git config --system --add safe.directory '*'
RUN npm install -g @anthropic-ai/claude-code@2.1.286
WORKDIR /eval/evaluator
COPY evaluator/package.json evaluator/package-lock.json ./
RUN npm ci --ignore-scripts
COPY evaluator/ ./
COPY shelfwright/contract/openapi.yaml /eval/shelfwright/contract/openapi.yaml
COPY instructions.md /eval/instructions.md
RUN chown -R node:node /eval
USER node

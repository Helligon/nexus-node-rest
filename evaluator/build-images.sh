#!/usr/bin/env bash
set -euo pipefail
EVAL="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$EVAL/.." && pwd)"
docker build -q -f "$EVAL/docker/builder.Dockerfile" -t shelfwright-builder "$EVAL/docker" >/dev/null
docker build -q -f "$EVAL/docker/scorer.Dockerfile" -t evaluator-scorer "$ROOT" >/dev/null
echo "Built shelfwright-builder and evaluator-scorer."

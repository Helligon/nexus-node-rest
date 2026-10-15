#!/usr/bin/env bash
# Usage: evaluator/score-run.sh <run-dir>   (re-runnable)
# 1) deterministic checks (build mounted read-write: install, build, test)
# 2) scorer agent: a separate session, build mounted READ-ONLY, builder transcript NOT mounted
set -euo pipefail
RUN_DIR="$(cd "${1:?usage: score-run.sh <run-dir>}" && pwd)"
SCORER_MODEL="${EVALUATOR_SCORER_MODEL:-claude-opus-5-5}"
mkdir -p "$RUN_DIR/score"

docker run --rm \
  -v "$RUN_DIR/repo:/work" \
  -v "$RUN_DIR/score:/out" \
  evaluator-scorer npx tsx checks/run-checks.ts /work /out \
  || echo "run-checks exited non-zero; see $RUN_DIR/score" >&2

docker run --rm \
  -e ANTHROPIC_API_KEY -e CLAUDE_CODE_OAUTH_TOKEN \
  -v "$RUN_DIR/repo:/work:ro" \
  -v "$RUN_DIR/score:/out" \
  -w /work \
  evaluator-scorer \
  timeout 1800 claude -p "$(cat "$(dirname "$0")/scorer/scorer-prompt.md")" \
    --model "$SCORER_MODEL" --dangerously-skip-permissions --output-format stream-json --verbose \
  > "$RUN_DIR/score/scorer-transcript.jsonl" 2> "$RUN_DIR/score/scorer-stderr.log" \
  || echo "scorer agent exited non-zero; see $RUN_DIR/score/scorer-stderr.log" >&2

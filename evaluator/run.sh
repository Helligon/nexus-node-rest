#!/usr/bin/env bash
# Usage: evaluator/run.sh <round> [runs=3]
# Env: ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN (required)
#      SHELFWRIGHT_BUILDER_MODEL (default claude-sonnet-5-5)
#      EVALUATOR_SCORER_MODEL   (default claude-opus-5-5)
#      SHELFWRIGHT_TIMEOUT_SECONDS (default 5400)
set -euo pipefail
ROUND="${1:?usage: run.sh <round> [runs]}"
RUNS="${2:-3}"
if [[ ! "$ROUND" =~ ^[A-Za-z0-9_-]+$ ]]; then echo "invalid round '$ROUND' (use letters, digits, - and _)" >&2; exit 2; fi
if [[ ! "$RUNS" =~ ^[1-9][0-9]*$ ]]; then echo "invalid runs '$RUNS' (positive integer)" >&2; exit 2; fi
EVAL="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$EVAL/.." && pwd)"
BUILDER_MODEL="${SHELFWRIGHT_BUILDER_MODEL:-claude-sonnet-5-5}"
SCORER_MODEL="${EVALUATOR_SCORER_MODEL:-claude-opus-5-5}"
TIMEOUT="${SHELFWRIGHT_TIMEOUT_SECONDS:-5400}"
PROMPT="Your working directory contains instructions.md. Read all of it, then follow it exactly to build the project in this directory. Work autonomously until every phase is complete or the instructions tell you to stop."

if [[ -z "${ANTHROPIC_API_KEY:-}" && -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]]; then
  echo "Set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN (claude setup-token)." >&2
  exit 2
fi
if [[ "$BUILDER_MODEL" == "$SCORER_MODEL" ]]; then
  echo "Note: builder and scorer use the same model ($BUILDER_MODEL). They are still separate sessions." >&2
fi
(cd "$ROOT/shelfwright" && npm run --silent check) || { echo "shelfwright check failed: instructions.md is stale (run npm run assemble) or shelfwright dependencies are not installed" >&2; exit 2; }

ROUND_DIR="$EVAL/rounds/$ROUND"
if [[ -e "$ROUND_DIR" ]]; then echo "$ROUND_DIR already exists; use a new round number" >&2; exit 2; fi
mkdir -p "$ROUND_DIR"
shasum -a 256 "$ROOT/instructions.md" | cut -d' ' -f1 > "$ROUND_DIR/instructions.sha256"
printf 'builder=%s\nscorer=%s\n' "$BUILDER_MODEL" "$SCORER_MODEL" > "$ROUND_DIR/models.txt"
"$EVAL/build-images.sh"

for i in $(seq 1 "$RUNS"); do
  RUN_DIR="$ROUND_DIR/run-$i"
  if [[ -e "$RUN_DIR" ]]; then echo "$RUN_DIR exists; use a new round number" >&2; exit 2; fi
  mkdir -p "$RUN_DIR/repo"
  cp "$ROOT/instructions.md" "$RUN_DIR/repo/instructions.md"
  echo "[round $ROUND] run $i/$RUNS: building ($BUILDER_MODEL)"
  set +e
  docker run --rm --name "shelfwright-r$ROUND-$i" \
    -e ANTHROPIC_API_KEY -e CLAUDE_CODE_OAUTH_TOKEN \
    -v "$RUN_DIR/repo:/work" \
    shelfwright-builder \
    timeout "$TIMEOUT" claude -p "$PROMPT" --model "$BUILDER_MODEL" --dangerously-skip-permissions \
      --output-format stream-json --verbose \
    > "$RUN_DIR/transcript.jsonl" 2> "$RUN_DIR/builder-stderr.log"
  echo $? > "$RUN_DIR/builder-exit-code"
  set -e
  echo "[round $ROUND] run $i/$RUNS: checks + scorer agent ($SCORER_MODEL)"
  EVALUATOR_SCORER_MODEL="$SCORER_MODEL" "$EVAL/score-run.sh" "$RUN_DIR"
done

(cd "$EVAL" && npx tsx report/diff-runs.ts "$ROUND_DIR")
(cd "$EVAL" && npx tsx report/review.ts "$ROUND_DIR")
echo "Examiner review: $ROUND_DIR/review.md"

#!/usr/bin/env bash
# Usage: evaluator/judge/judge.sh <round>   Writes evaluator/rounds/<round>/judge.md
set -euo pipefail
ROUND="${1:?usage: judge.sh <round>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$ROOT/evaluator/rounds/$ROUND"
mkdir -p "$OUT"
claude -p "$(cat "$HERE/judge-prompt.md")" --model "${EVALUATOR_JUDGE_MODEL:-claude-opus-5-5}" \
  < "$ROOT/instructions.md" > "$OUT/judge.md"
echo "Judge findings: $OUT/judge.md"

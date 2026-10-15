#!/usr/bin/env bash
# Usage: evaluator/judge/judge.sh <round>   Writes evaluator/rounds/<round>/judge.md
set -euo pipefail
ROUND="${1:?usage: judge.sh <round>}"
if [[ ! "$ROUND" =~ ^[A-Za-z0-9_-]+$ ]]; then echo "invalid round '$ROUND' (use letters, digits, - and _)" >&2; exit 2; fi
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$ROOT/evaluator/rounds/$ROUND"
mkdir -p "$OUT"
PROMPT="$(cat "$HERE/judge-prompt.md")"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cd "$TMP"
if claude -p "$PROMPT" --model "${EVALUATOR_JUDGE_MODEL:-claude-opus-5-5}" \
  < "$ROOT/instructions.md" > "$TMP/judge.md"; then
  mv "$TMP/judge.md" "$OUT/judge.md"
  echo "Judge findings: $OUT/judge.md"
else
  echo "judge failed; no judge.md written" >&2
  exit 1
fi

#!/usr/bin/env bash
# Usage: evaluator/score-run.sh <run-dir>   (re-runnable)
# 1) deterministic checks (build mounted read-write: install, build, test)
# 2) scorer agent: a separate session, build mounted READ-ONLY, builder transcript NOT mounted
set -euo pipefail
RUN_DIR="$(cd "${1:?usage: score-run.sh <run-dir>}" && pwd)"
SCORER_MODEL="${EVALUATOR_SCORER_MODEL:-claude-opus-5-5}"
SCORE="$RUN_DIR/score"
mkdir -p "$SCORE"
# Never leave evidence from an earlier scoring pass behind.
rm -rf "$SCORE/logs"
rm -f "$SCORE/checks.json" "$SCORE/probe.json" "$SCORE/scorecard.md" "$SCORE/scorer-transcript.jsonl" "$SCORE/scorer-stderr.log"

docker run --rm \
  -v "$RUN_DIR/repo:/work" \
  -v "$SCORE:/out" \
  evaluator-scorer timeout 3600 npx tsx checks/run-checks.ts /work /out \
  || echo "run-checks exited non-zero; see $SCORE" >&2

if [[ ! -f "$SCORE/checks.json" ]]; then
  printf '# Scorecard\n\n## Summary\n\nChecks did not produce checks.json, so the build could not be assessed.\n\nRecommendation: REJECT\n' > "$SCORE/scorecard.md"
  echo "checks did not produce checks.json; wrote a REJECT scorecard" >&2
  exit 0
fi
mkdir -p "$SCORE/logs"

# The scorer works from /tmp with user settings only, so nothing in the build (CLAUDE.md, .claude/) is loaded.
MOUNTS=(
  -v "$RUN_DIR/repo:/work:ro"
  -v "$SCORE:/out"
  -v "$SCORE/checks.json:/out/checks.json:ro"
  -v "$SCORE/logs:/out/logs:ro"
)
if [[ -f "$SCORE/probe.json" ]]; then MOUNTS+=(-v "$SCORE/probe.json:/out/probe.json:ro"); fi

docker run --rm \
  -e ANTHROPIC_API_KEY -e CLAUDE_CODE_OAUTH_TOKEN \
  "${MOUNTS[@]}" \
  -w /tmp \
  evaluator-scorer \
  timeout 1800 claude -p "$(cat "$(dirname "$0")/scorer/scorer-prompt.md")" \
    --model "$SCORER_MODEL" --setting-sources user --dangerously-skip-permissions --output-format stream-json --verbose \
  > "$SCORE/scorer-transcript.jsonl" 2> "$SCORE/scorer-stderr.log" \
  || echo "scorer agent exited non-zero; see $SCORE/scorer-stderr.log" >&2

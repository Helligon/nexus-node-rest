# Evaluator

Assesses builds produced by Shelfwright (`../instructions.md`). It lives above the agent and the
app; nothing here is ever visible to a builder.

## Design rules

1. **No hidden requirements.** Every check traces to a sentence in `instructions.md`. Manifest checks read the canonical `instructions.md`, and the run's copy must be byte-identical to it.
2. **A run cannot pass by editing its own checks.** The acceptance suite and golden baseline never ship in a build. Every gate is re-run here. Coverage is read from the report, the contract is hash-compared, and source is scanned for suppressions.
3. **A different agent scores.** The scorer agent is a separate session, by default on a different model from the builder. It sees the build read-only and never sees the builder transcript.
4. **Facts, advice, verdict.** `checks.json` is fact. `scorecard.md` is the scorer agent's advice. The examiner's `review.md` verdict is final.
5. **Docker isolates evaluation.** Builders run in `shelfwright-builder`. Checks and the scorer run in `evaluator-scorer`. Agent-written code never runs on the host.

## Prerequisites

- Docker Desktop running.
- `ANTHROPIC_API_KEY`: use a dedicated key in a separate workspace with a spend cap, and revoke it after the round.
  If you use `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` instead, revoke or rotate it after the round:
  it is present in the builder sandbox, where code the agent runs can read it.
- `npm install --ignore-scripts` in `evaluator/` and `shelfwright/`.

## A round

1. `npm test && npm run preflight` here, and `npm test && npm run check` in `../shelfwright`.
2. `judge/judge.sh <round>`, then read `rounds/<round>/judge.md` and decide what to fix first.
3. `./run.sh <round> [runs=3]`. For each run:
   - the builder sandbox builds the app;
   - `run-checks` writes `checks.json`;
   - the scorer agent writes `scorecard.md`.
4. Open `rounds/<round>/review.md`. Work through each run and write your verdict. A failing `npm audit` appears there as an advisory finding, not a gate failure.
5. Scan transcripts for secrets before committing (e.g. `grep -rE 'sk-ant-|ANTHROPIC_API_KEY=|CLAUDE_CODE_OAUTH_TOKEN=' rounds/<round>`), then commit the round evidence. Transcripts and stderr logs are git-ignored by default; commit them (`git add -f`) only after the secrets scan.
6. Make the approved changes in `../shelfwright`, run `npm run assemble`, and log each one in `CHANGELOG.md`.
7. Done when one round of 3 runs is all PASS and matches golden.

## Checks

| Check | Traces to |
|---|---|
| Contract hash | instructions §7 Phase 1, Appendix A |
| Manifests (exact deps and scripts, no forbidden fields or install hooks) | instructions §2 rule 4, §6.1, §6.2, §6.3 |
| Source scan (includes `conformance/`; skips `scripts/check-rules.mjs`, which §6.4 allows to hold the banned tokens) | instructions §2 rules 3 and 7, §6.4 |
| Gates (including `check:rules` and the build's own `test:conformance` suite) | instructions §4.5, §6.2 scripts, §6.4, Phase gates |
| Coverage (report, all files) | instructions §4.5, §6.1 |
| Acceptance suite | instructions §4 and the contract |
| Probe vs golden (exact messages, issues and detail order) | instructions §4 (including §4.7) and the contract |
| Log rules | instructions §4.3 |
| npm audit (advisory, not a gate) | instructions §7 Phase 4 step 2 |

Re-score a run with `./score-run.sh rounds/<round>/run-<i>`. Regenerate a review with
`npx tsx report/review.ts rounds/<round> --force`; this overwrites your notes.

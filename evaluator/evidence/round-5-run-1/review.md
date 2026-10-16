# Round 5: examiner review

instructions.md sha256: `15db5d38184a004d39966e1848effce57abf1aabcfbc7203fabf692adb2b7e46`
Models: builder=claude-sonnet-5-5, scorer=claude-opus-5-5
Judge findings: not run
Behaviour vs golden: **all runs identical** ([diff.md](diff.md))

Automated results are facts. The scorer agent gives advice. **Your verdict is final.**

| Run | Builder exit | Instructions | Contract | Manifests | Source scan | Gates | Coverage | Acceptance | Logs | Behaviour | Scorer agent |
|---|---|---|---|---|---|---|---|---|---|---|---|
| run-1 | 0 | PASS | PASS | PASS | PASS | 11/11 | PASS | PASS | PASS | PASS | FIX FIRST |

## run-1

- Repo: [run-1/repo](run-1/repo) · Builder transcript: [run-1/transcript.jsonl](run-1/transcript.jsonl) · Build report: [run-1/repo/BUILD_REPORT.md](run-1/repo/BUILD_REPORT.md) · Scorecard: [run-1/score/scorecard.md](run-1/score/scorecard.md)
- Commits: 7 · Uncommitted changes: 0 · BUILD_REPORT.md present: yes

### Examiner checklist

- [ ] The app works: I can register a book, see field errors, and filter the list. Start it in a container (no credentials): `docker run --rm -it -p 3000:3000 -p 5173:5173 -v "$PWD/run-1/repo:/work" -w /work shelfwright-builder sh -c 'npm run dev -w backend & npm run dev -w frontend -- --host 0.0.0.0'` from the round directory, then open http://localhost:5173.
- [ ] No code I would refuse to ship: security smells, dead code, hacks, misleading names.
- [ ] Tests are honest and were written first; the agent's contract tests really check the contract.
- [ ] Logging follows §4.3: only `http_response` and `error`, nothing sensitive.
- [ ] `BUILD_REPORT.md` is truthful; its "Unspecified decisions" are acceptable.
- [ ] I agree or disagree with the scorer agent's recommendation, and say why.

**Verdict (PASS / FAIL):**

**Notes:**


## Round verdict

- [ ] Every run is PASS and behaviour matches golden → the round passes.

**Changes to Shelfwright I approve** (record each in `evaluator/CHANGELOG.md` with the finding that caused it):


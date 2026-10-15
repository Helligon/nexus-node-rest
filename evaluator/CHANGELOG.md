# Shelfwright changelog

Every change to Shelfwright (`shelfwright/`, and therefore `instructions.md`) after round 1, with the
finding that caused it and the examiner's approval.

| Date | Round | Finding (source) | Change | Approved by |
|---|---|---|---|---|
| 2026-10-15 | 1 | judge.md #1 | URIError from malformed path percent-encoding → 404 NOT_FOUND, not logged (§2.2 errorHandler, §4.2, checklist item 16); golden server and acceptance test updated | examiner |
| 2026-10-15 | 1 | judge.md #2 | errorHandler lists every body-parser mapping; other exposed 4xx errors → 400 `could not be read`; nothing 4xx logged (§2.2, §4.2 Body shape, items 22–23) | examiner |
| 2026-10-15 | 1 | judge.md #3 | Fixed `message` and `issue` texts, one issue per field, detail order (new §4.7; §4.2 Error body); golden server and probe baseline updated | examiner |
| 2026-10-15 | 1 | judge.md #4 | Characters = UTF-16 code units via `.length` after `.trim()` (§4.1 note, §4.2 references, item 4 emoji case) | examiner |
| 2026-10-15 | 1 | judge.md #5 | ESLint `linterOptions.noInlineConfig` + `reportUnusedDisableDirectives` (§6.1); `check:rules` scans for suppressions (§6.4, rule 3); source scan exempts `scripts/check-rules.mjs` | examiner |
| 2026-10-15 | 1 | judge.md #6 | `scripts/check-rules.mjs` compares manifests with §6.2/§6.3, forbids extra manifest fields and install hooks, checks coverage thresholds (§6.4, all gates); manifest check reports forbidden fields and hooks | examiner |
| 2026-10-15 | 1 | judge.md #7 | Frontend tests have pinned titles (§3.3), checked by `check:rules`; Phase 3 gate runs it | examiner |
| 2026-10-15 | 1 | judge.md #8 | Phase 4 reordered (README, verify, audit, BUILD_REPORT, gate last); gate adds `check-rules --report` (README headings, BUILD_REPORT filled) | examiner |
| 2026-10-15 | 1 | judge.md #9 | No `npx`: gates use `npm exec --no -- tsc` and `npm run lint` (rule 5); shelfwright test forbids `npx` in instructions.md | examiner |
| 2026-10-15 | 1 | judge.md #10 | First install uses `--before=2026-10-01T00:00:00Z` (Phase 1 step 3, §4.5 Versions); preflight installs with the same cut-off | examiner |
| 2026-10-15 | 1 | judge.md #11 | Rule 4 forbids `--force`/`--legacy-peer-deps` and makes install failure a gate failure; 14-day claim restated as how pins were chosen | examiner |
| 2026-10-15 | 1 | judge.md #12 | `parseNewAsset(undefined)` behaves like `{}`; handler passes `req.body` directly (§2.1, §2.2, item 4) | examiner |
| 2026-10-15 | 1 | judge.md #13 | Smoke script spawns with `process.execPath` and cleans up in `try/finally` with SIGTERM, 5 s wait, SIGKILL (§2.4) | examiner |
| 2026-10-15 | 1 | judge.md #14 | Form: inline errors for title/author/isbn/status, general alert text for body/unknown fields, clearing on resubmit, reset after 201 (§3.2) | examiner |
| 2026-10-15 | 1 | judge.md #15 | `listAssets` trims each filter, then omits it if empty (§3.1) | examiner |
| 2026-10-15 | 1 | judge.md #1–#15 | New §2.1 "What not to do" list, one bullet per finding above | examiner |
| 2026-10-15 | 1 | judge fix-wave review | ESLint `no-unused-vars` with `argsIgnorePattern: '^_'` and a named `errorHandler(logger)` export (§6.1, Phase 2 §2.1/§2.2, item 23); "What not to do" heading unnumbered; §6.4: BUILD_REPORT `- …:` and coverage lines must be filled, title check triggers on any frontend test file, `.cjs` scanned; list wording. Evaluator: `check-rules` gate; probe compares exact messages, issues and detail order; golden baseline regenerated | examiner |
| 2026-10-15 | 2 | judge.md #1 | None: declined by design — examiner. Nexus hands over `instructions.md` as a file; Phase 0 step 2 already says to save it unchanged | examiner |
| 2026-10-15 | 2 | judge.md #2 | None: declined by design — examiner. Verbatim content stays minimal; the evaluator re-checks manifests, sources, coverage and gates independently | examiner |
| 2026-10-15 | 2 | judge.md #3 | None: declined by design — examiner. Replaced by the builder-written conformance suite decision below; the evaluator's acceptance suite stays separate | examiner |
| 2026-10-15 | 2 | judge.md #4 | §6.4 item 2: `check:rules` reads `backend/coverage/coverage-summary.json` when it exists (all four totals `=== 100`, an entry for every `backend/src/**/*.ts` except `server.ts`) and checks pinned `include`/`exclude` lines in `backend/vitest.config.ts` and `frontend/vite.config.ts` (§6.1); What-not-to-do list updated | examiner |
| 2026-10-15 | 2 | judge.md #5 | §4.2 new row "Preflight / OPTIONS": `cors()` answers every `OPTIONS` with 204, ahead of the 405/404 rows; What-not-to-do bullet | examiner |
| 2026-10-15 | 2 | judge.md #6 | §4.1, §4.7: an empty body key → field `body`, an empty query key (`?=x`) → field `query`; golden server updated test-first; acceptance test for `?=x` | examiner |
| 2026-10-15 | 2 | judge.md #7 | §4.1 ISBN normalisation removes only `/[ -]/g`; checklist item 1 and What-not-to-do list; golden server `[\s-]` → `[ -]` test-first; acceptance test rejects a tab in an ISBN | examiner |
| 2026-10-15 | 2 | judge.md #8 | §3.2 List: **Loading…** only on first load, request ids discard stale responses, no aborts; §3.3 adds App test `'ignores a stale response'` (14 titles in `check:rules`) | examiner |
| 2026-10-15 | 2 | judge.md #3 (conformance decision) | §4.5 "Conformance suite" row; layout `conformance/`; §6.1 config and root tsconfig; §6.2 `test:conformance`, `verify` runs it; §6.4 scans `conformance/`; Phase 2 §2.5 and gate; Appendix B. Evaluator: source scan covers `conformance/`, `conformance` gate after `backend-coverage`, README; spec §6 decision | examiner |
| 2026-10-16 | 2 | scorecard: Object.keys query order (§4.7) | Unknown query parameters reported in raw query-string order via `URLSearchParams`, never `req.query` (§2.1 signature, §4.7, item 5, What not to do); probe step `list-numeric-key`, golden baseline and acceptance test added | examiner |

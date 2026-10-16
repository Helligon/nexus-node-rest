# Build report

- Date (UTC): 2026-10-16
- Agent and model: Claude Code, Sonnet 5.5 (claude-sonnet-5-5)
- Node / npm versions: v24.22.0 / 11.19.1

## Phase results

| Phase | Gate | Result (PASS / FAIL) | Attempts | Notes |
|---|---|---|---|---|
| 0 Preflight | Node version check | PASS | 1 | |
| 1 Scaffold | contract hash, contract:validate, tsc, lint, check:rules | PASS | 1 | |
| 2 Backend | test:contract, test:coverage, smoke, test:conformance, tsc, typecheck, lint, check:rules | PASS | 2 | First run failed lint (`no-explicit-any` in conformance tests); fixed with a typed body interface. |
| 3 Frontend | frontend test, build, typecheck, lint, check:rules | PASS | 1 | Contract helper had to resolve its path without the global `URL` so it loads under jsdom. |
| 4 Verify | npm run verify, check-rules --report | PASS | 1 | |

## Backend coverage

Lines / branches / functions / statements: 100% / 100% / 100% / 100%

## Deviations from instructions

None.

## Unspecified decisions

- Backend: `parseNewAsset` rejects `status: null` (only `isbn` accepts null).
- Backend: `durationMs` is rounded to one decimal place.
- Backend: `SIGTERM`/`SIGINT` call `server.close()` and let the process exit when connections drain.
- Frontend: an ISBN is omitted from the request when it is the empty string; otherwise it is sent as typed.
- Frontend: a 400 whose details name only known fields shows no general alert; any other field also shows it.
- Frontend: a failed reload replaces the table with the load-error alert; the next successful load restores it.
- Frontend: the form's React-controlled inputs use ids `title`, `author`, `isbn`, `status`; filter inputs use `filter-*` ids.
- Tests: frontend tests import the contract helper through relative paths and the helper uses `node:path` for its spec path.
- Conformance: tests run with `CORS_ORIGIN=http://localhost:5173` set explicitly by `global-setup.ts`.

## npm audit

`npm audit --audit-level=high`: found 0 vulnerabilities.

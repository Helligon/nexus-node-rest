# Build report

- Date (UTC): 2026-10-16
- Agent and model: Claude Code (Claude Agent SDK), Sonnet 5.5 (claude-sonnet-5-5)
- Node / npm versions: Node v24.22.0 / npm 11.19.1

## Phase results

| Phase | Gate | Result (PASS / FAIL) | Attempts | Notes |
|---|---|---|---|---|
| 0 Preflight | Node version check | PASS | 1 | |
| 1 Scaffold | contract hash, contract:validate, tsc, lint, check:rules | PASS | 1 | Contract SHA-256 matched. |
| 2 Backend | test:contract, test:coverage, smoke, test:conformance, tsc, typecheck, lint, check:rules | PASS | 3 | Attempts 1 and 2 failed on type errors (`unknown` JSON in conformance and smoke) and an irregular-whitespace lint error, fixed in the code. |
| 3 Frontend | frontend test, build, typecheck, lint, check:rules | PASS | 1 | |
| 4 Verify | npm run verify, check-rules --report | PASS | 1 | |

## Backend coverage

Lines / branches / functions / statements: 100% / 100% / 100% / 100%

## Deviations from instructions

None. The only change after a gate passed was in `contract/contract-helper.ts`: it resolves `openapi.yaml` with `import.meta.dirname` instead of `new URL(..., import.meta.url)`, because the latter fails under the frontend's jsdom test environment.

## Unspecified decisions

- Zod's own length checks count code points, so title and author lengths use `.length` inside a Zod `refine`, as §4.1 requires.
- `GET /assets` with a known parameter given twice reports `must be given once`; an unknown repeated parameter reports `is not a supported filter` (unknown is checked first).
- The frontend omits `isbn` only when it is an empty string; a whitespace-only ISBN is sent and rejected by the server.
- A non-Axios error thrown during an API call is rethrown unchanged; an Axios error with no usable error body becomes `ApiError` with code `UNKNOWN_ERROR`.
- The frontend does not use React `StrictMode`, to avoid duplicate requests in development.
- If the first load fails, the list shows the load error; a later successful reload replaces it.
- The conformance suite has an extra `conformance/support.ts` helper file, and the repository tests are in a single file.
- The smoke and conformance servers are addressed at 127.0.0.1.

## npm audit

`npm audit --audit-level=high`: found 0 vulnerabilities.

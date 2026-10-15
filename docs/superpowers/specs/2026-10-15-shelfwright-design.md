# Shelfwright Design Spec (v2)

Date: 2026-10-15
Status: Approved in conversation. v2 consolidates every amendment; v1 is in git history.

## 1. Context

Nexus's pre-interview exercise (`Nexus - Task Brief.pdf`) asks for a small book-tracking service
(Node REST backend + React frontend) built with an agent. The primary deliverable is
`instructions.md`. Nexus hands that file to **their** agent (unknown tool and model, on a machine we
have never seen) to rebuild our work, then compares the result with our repo.

We are building the **agent**, not the app, plus our own private evaluation of that agent.

### Terminology

| Name | What it is | Location |
|---|---|---|
| **Shelfwright** | The agent: `instructions.md`, a self-contained build brief for the app | `shelfwright/` (source), `instructions.md` (generated deliverable) |
| **Library Asset Service** | The app a Shelfwright run produces | each run's output; the reference build goes in `library-asset-service/` |
| **Evaluator** | Everything that assesses a Shelfwright run: hidden acceptance suite, golden server, automated checks, scorer agent, judge and round reports | `evaluator/` |
| **Builder** | The agent instance executing `instructions.md` | builder sandbox container |
| **Scorer agent** | A *different* agent instance that reviews a finished build | scorer container |
| **Examiner** | The user, who gives the final verdict on every run | — |

### Goals

- **Consistency:** any two runs produce apps with identical external behaviour.
- **Repeatability:** a fresh agent with only `instructions.md` succeeds without help.
- **Accuracy:** the app matches the contract and the decisions log exactly.

### Non-goals

- Depending on a particular agent tool (no slash commands, skills or subagents in `instructions.md`).
- Embedding app source in `instructions.md`. Only the API contract is verbatim.
- UI polish (Nexus does not assess it).
- Containerising the app now. That is decided in Finalising (see §6).

## 2. Repository layout

```
nexus-node-rest/
├── docs/                        spec + plans
├── instructions.md              Shelfwright, generated (the Nexus deliverable)
├── shelfwright/                 THE AGENT (source of instructions.md)
│   ├── instructions.template.md
│   ├── contract/openapi.yaml    the only verbatim content
│   └── assembler + tests
├── evaluator/                   ABOVE agent and app; never visible to a builder
│   ├── oracle/                  hidden acceptance suite, golden server, golden probe baseline
│   ├── checks/                  deterministic checks + run-checks CLI
│   ├── scorer/                  scorer-agent prompt and rubric
│   ├── judge/                   LLM judge for instructions.md
│   ├── report/                  round diff + examiner review generator
│   ├── docker/                  builder sandbox image, scorer image
│   └── rounds/<n>/run-<i>/      evidence and the examiner's review.md
└── library-asset-service/       reference build (committed in Finalising)
```

## 3. Part A: Shelfwright (`instructions.md`)

### A1. Content rule

`instructions.md` contains **only** what is needed to build the Library Asset Service consistently:
- the mission, ground rules and prerequisites;
- the decisions log;
- the target layout;
- the phases, each with a gate command;
- the verbatim contract;
- the exact dependency and script tables;
- the `BUILD_REPORT.md` template.

It never mentions evaluation, judges, scorers, oracles, golden baselines or eval rounds. An
automated test enforces this.

### A2. What is pinned, and how

| Item | How it is pinned |
|---|---|
| `contract/openapi.yaml` | Verbatim block + its SHA-256; the Phase 1 gate checks the hash |
| Dependencies | Exact-version table (workspace, section, package, version) |
| npm scripts | Exact table (workspace, name, command) |
| Configs (tsconfig, ESLint, Vitest, Vite) | Prose: the required settings, not file contents |
| Coverage | 100% lines/branches/functions/statements; `json-summary` reporter; only `src/server.ts` excluded |
| Behaviour | Decisions log + contract |
| Module interfaces and UI text | Exact exported names and signatures, and exact visible strings |

The **agent writes its own contract tests**, test-first. It writes a contract helper (Ajv against
`openapi.yaml`) together with that helper's tests, before anything else. After that, every backend
HTTP test and every frontend mock response is validated through the helper.

### A3. Phases

| # | Phase | Gate (must exit 0) |
|---|---|---|
| 0 | Preflight (Node 24, git) | `node -e` version check |
| 1 | Scaffold: contract, manifests, configs, install | contract hash + `contract:validate` + `tsc` + `eslint` |
| 2 | Contract helper (TDD), then backend (TDD checklist) | `test:contract` + backend `test:coverage` + `smoke` + typecheck + lint |
| 3 | Frontend | frontend `test` + `build` + `typecheck` + lint |
| 4 | Verify and report | `npm run verify` |

Ground rules:
- Do the phases in order.
- After three failures in a row, stop and report.
- Never weaken a check: no suppression comments, no skipped tests, no edits to the contract or thresholds.
- Use exact dependency versions only, and always pass `--ignore-scripts`.
- Download no outside code, and add no secrets.
- Only the two logger modules may log.
- Record every unspecified choice in `BUILD_REPORT.md`.
- Commit after each gate passes.

### A4. Decisions log (app decisions, embedded in `instructions.md` §4)

The decisions log covers the domain, HTTP behaviour, observability, configuration and toolchain
decisions listed in Part C. It also lists the **production features omitted from this demo**:
- a real database (SQLite for small scale, PostgreSQL for larger) behind `AssetRepository`;
- bulk CSV import through the API;
- authentication;
- deployment packaging (containers), decided separately.

`BUILD_REPORT.md` is kept. It is a normal build artifact that records phase results, deviations and
unspecified decisions. This covers the brief's "write it down rather than guessing silently".

## 4. Part B: Evaluator

### B1. Design rules

1. **Outside Shelfwright.** The evaluator lives above the agent and the app; nothing in a build depends on it.
2. **No hidden requirements.** Every check traces to a sentence in `instructions.md`. The hidden acceptance suite only tests behaviour the instructions spell out. Manifest checks take their expectations from the run's own copy of `instructions.md`.
3. **Cannot be fooled by a run editing its own checks.** The oracle never ships inside a build, and every gate is re-run independently. Coverage is read from the report, not the config. The contract is hash-compared, and source is scanned for suppressions.
4. **A different agent scores.** The scorer agent is a separate session: its own prompt, no access to the builder transcript, a different model by default, and read-only access to the build.
5. **Automated results are facts.** The scorer agent's review is advice. The examiner's verdict is final.
6. **Docker isolates evaluation.** Builders run in a sandbox container. Checks and the scorer agent run in a scorer container. Agent-written code never runs on the host.

### B2. Components

- **Oracle.** A black-box acceptance suite over HTTP (`BASE_URL`), with its own contract helper. An independent golden server (plain `node:http`) proves the suite and produces the behaviour baseline (`golden-probe.json`).
- **Checks.** `run-checks.ts` runs inside the scorer container and writes `checks.json`. It covers:
  - the contract hash;
  - manifests (dependencies and scripts must match exactly);
  - a source scan for suppressions, focused or skipped tests, and console use outside the loggers;
  - gates: install, typecheck, lint, contract validate, contract tests, backend coverage, frontend tests, frontend build and smoke (`npm audit` is recorded separately as an advisory result);
  - coverage: every total at 100%, and every `backend/src` file present in the report;
  - the hidden acceptance suite, run against the built server;
  - the 28-step behaviour probe;
  - log rules: only `http_response` and `error` JSON lines, exactly one per response;
  - whether `BUILD_REPORT.md` exists, and the commit count.
- **Scorer agent.** Reads the build (read-only) and `checks.json`. Scores a rubric with file:line evidence: test-first evidence, test quality, contract fidelity, security, clarity, and adherence to instructions plus report honesty. Writes `scorecard.md`, ending in `Recommendation: SHIP | FIX FIRST | REJECT`.
- **Judge.** Reviews `instructions.md` before a round for ambiguity, contradictions, unpinned behaviour, tool assumptions, unsafe instructions, weak gates and infeasible steps.
- **Report.** `diff.json` and `diff.md` compare each run's probe with golden. `review.md` has a summary table, per-run findings, the examiner checklist and verdict lines. An existing `review.md` is never overwritten.
- **Preflight.** Installs the pinned dependency table into a clean temp project, to catch version conflicts before spending agent runs.

### B3. Round flow

1. The evaluator tests, the `shelfwright` tests and preflight all pass.
2. The judge reviews `instructions.md`, and the examiner decides which findings to fix.
3. `run.sh <round> <N>` runs, for each run: builder sandbox → checks → scorer agent.
4. The round diff against golden and `review.md` are generated.
5. The examiner completes `review.md`. Approved changes go into `shelfwright/` and are logged in `evaluator/CHANGELOG.md`.
6. Exit criterion: one round of N=3 in which the examiner marks every run PASS and behaviour is identical to golden.

## 5. Part C: Library Asset Service requirements (what `instructions.md` pins)

### C1. API contract

Asset fields:
- `id`: UUID v4.
- `title`: trimmed, 1–200 characters.
- `author`: trimmed, 1–100 characters.
- `isbn`: optional. Spaces and hyphens are stripped and `x` becomes `X`. It must then pass the ISBN-10 or ISBN-13 checksum. It is stored normalised and must be unique (otherwise 409).
- `status`: `available|on_loan|lost`, default `available`, set only at creation.
- `createdAt`: ISO 8601 UTC.

| Endpoint | Success | Errors |
|---|---|---|
| `GET /ping` | `200 {"status":"ok"}` | 405 |
| `POST /assets` | `201` asset, `Location: /assets/{id}` | 400, 409, 413, 415, 405 |
| `GET /assets?author&status&q` | `200 {"data":[...]}` in creation order | 400 |
| `GET /assets/{id}` | `200` asset | 404 (including non-UUIDs), 405 |

Errors use the envelope `{"error":{"code","message","details"?}}`. `details` appears on
`VALIDATION_ERROR` and on nothing else. Codes:

| Code | Status | Notes |
|---|---|---|
| `VALIDATION_ERROR` | 400 | |
| `NOT_FOUND` | 404 | |
| `METHOD_NOT_ALLOWED` | 405 | with an `Allow` header |
| `CONFLICT` | 409 | |
| `PAYLOAD_TOO_LARGE` | 413 | body over 10 kb |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | |
| `INTERNAL_ERROR` | 500 | generic message |

Other rules:
- Unknown POST fields are rejected.
- An empty JSON body is treated as `{}`.
- Malformed or non-object JSON is reported on field `body`.
- Filter values are trimmed and combined with AND. Unknown, repeated, empty or over-long parameters return 400.

### C2. Backend

- TypeScript, Express 5, Zod 4, helmet, cors; tests with Vitest + Supertest.
- Built test-first, with 100% coverage. Only `server.ts` is excluded.
- Dependencies injected through `createApp({repo, logger, clock, idGen, corsOrigin})`.
- In-memory async repository.

### C3. Logging

Only two kinds of JSON log line, and nothing else:
- `http_response`, one per response. Backend fields: method, path without query, status, durationMs. Frontend fields: method, url, status.
- `error`, for unexpected failures only: 500s, process-level errors, and in the frontend, network failures and uncaught errors.

### C4. Frontend

- React 19 + Vite, with an axios client that has a logging interceptor.
- One page: a register form and a filterable list, using exact UI strings.
- Validation happens on the server only.
- Tested with RTL + MSW; mock responses are validated against the contract.

### C5. Configuration

| Variable | Default |
|---|---|
| `PORT` | `3000` |
| `CORS_ORIGIN` | `http://localhost:5173` |
| `VITE_API_URL` | `/api` (the Vite dev proxy strips `/api`) |

## 6. Decisions recorded by the examiner

| Decision | Reason |
|---|---|
| Exact package versions everywhere | Known-safe versions avoid newly published compromised releases, a risk that is more common now agents install packages autonomously. Pins are also at least 14 days old when chosen, and installs use `--ignore-scripts`. |
| Docker is used to evaluate the agent; whether to containerise the app is decided at the end | Sandboxing untrusted agent code is required for evaluation. App packaging is a delivery choice, made once the app is proven. |
| The scorer cannot be fooled by a run editing its own oracle | The oracle lives only in the evaluator, and every check is re-run independently. |
| Evaluation lives outside Shelfwright, above agent and app | Shelfwright stays a clean deliverable, and the oracle is written once. |
| A different agent scores the work | A builder grading itself has every incentive, and every blind spot, to pass itself. |
| The agent writes its own contract tests, test-first, from `openapi.yaml`; verbatim content is minimal | Less copied code. The agent must derive tests from a contract, and the hidden suite checks the result. |
| `instructions.md` contains only build instructions and app decisions | It is the deliverable a stranger's agent receives. Evaluation is our private concern. |
| `BUILD_REPORT.md` is kept | It records results, deviations and unspecified decisions honestly. |

Other decisions made during planning: Node 24 LTS; `405` with `Allow` for wrong methods; an empty
JSON body is treated as `{}`; `error` log lines only for unexpected failures.

## 7. Production features omitted from the demo

1. A real database: SQLite for small scale, PostgreSQL for larger deployments, behind `AssetRepository`.
2. Bulk CSV import of a large number of books through the API. For example, `POST /assets/import` accepting `text/csv`, with row-level validation and a per-row error report.
3. Authentication and authorisation.
4. Deployment packaging (containers), to be decided in Finalising.

## 8. Risks

- **Agent portability:** eval runs only use Claude Code. The judge checks for tool assumptions, and trying a second agent is on the "twice the time" list.
- **Transitive drift:** the lockfile is generated per build. Pinning direct dependencies limits drift but does not remove it.
- **Cost and time:** each run is a full agent build plus a scorer session. N defaults to 3.
- **Scorer-agent bias:** reduced by giving it facts first (`checks.json`), requiring evidence in the rubric, using a different default model, and keeping the examiner's verdict final.

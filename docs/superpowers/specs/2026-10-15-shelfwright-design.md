# Shelfwright — Design Spec

Date: 2026-10-15
Status: Draft, awaiting review

## 1. Context

Nexus's pre-interview exercise (`Nexus - Task Brief.pdf`) asks for a small
book-tracking service (Node REST backend + React frontend), built with an
agent. The primary deliverable is `instructions.md`: a file Nexus will hand to
**their** agent (tool and model unknown, on a machine we have never seen) to
rebuild our work. They compare its output against our repo.

What we are building is the **agent**, not the app.

### Terminology

| Name | What it is | Who writes it | Changes when |
|---|---|---|---|
| **Shelfwright** | `instructions.md`: a fixed, versioned, agent-agnostic build chain | Us (once, then refined) | Only after a reviewed eval round, with the examiner's approval |
| **Shelfwright eval harness** | `eval/`: runs Shelfwright repeatedly and scores each run | Us | As needed; private tooling, not sent to Nexus |
| **Library Asset Service** (the app) | Backend + frontend + containers | Produced by a Shelfwright run | Every run (regenerated) |
| **Reference build** | One Shelfwright run's output, committed as the repo we submit | Shelfwright | When a round is accepted |
| **Examiner** | The user, who gives the final verdict on every eval run | — | — |

### Goals

- **Consistency**: any two runs produce apps with identical external behaviour.
- **Repeatability**: a fresh agent with only `instructions.md` succeeds without help.
- **Accuracy**: the app matches the pinned contract and the decisions log exactly.

### Non-goals

- Depending on any particular agent tool. Shelfwright must not require Claude
  Code skills, subagents or slash commands.
- Embedding the app's source code verbatim. Only the contract and acceptance
  tests are verbatim; everything else is specified, not dictated.
- UI polish (Nexus explicitly does not assess it).

---

## Part A — What we build

### A1. `instructions.md` (Shelfwright)

A single self-contained Markdown file. Sections, in order:

1. **Mission**: one paragraph. What to build, and that the agent must follow
   this file exactly. Where the file is silent, the agent picks the simplest
   option and records it in `BUILD_REPORT.md` under "Unspecified decisions".
2. **Ground rules for the agent**:
   - Do not change anything marked VERBATIM.
   - Do not move to the next phase until the current phase's gate command
     exits 0. If a gate fails 3 times in a row, stop and write the failure to
     `BUILD_REPORT.md`; do not weaken tests or thresholds to get through.
   - Never edit coverage thresholds, lint rules, the contract or the acceptance
     suite to make a gate pass.
   - Supply chain: install only the dependencies listed, at the exact versions
     listed; use `npm ci` after the lockfile exists; no `postinstall` scripts;
     run `npm audit --audit-level=high` in the final gate.
   - No secrets in code; config comes only from the env vars listed.
3. **Environment prerequisites**: Node 22 LTS, npm 10, Docker with Compose v2.
   A preflight command checks them.
4. **Decisions log**: every point where the Nexus brief is silent, what we
   chose, and why (see A3). This is also what Nexus reads for "System Design".
5. **Target repo layout**: the full file tree.
6. **Phases 0–6**: each has *Goal → Steps → Gate command → Done when*. See A2.
7. **Appendix A (VERBATIM)**: `contract/openapi.yaml`.
8. **Appendix B (VERBATIM)**: black-box acceptance suite (`acceptance/*.test.ts`),
   run over HTTP against `BASE_URL`.
9. **Appendix C**: pinned dependency list (name@exact-version per workspace).
10. **Appendix D**: `BUILD_REPORT.md` template the agent fills in at the end.

### A2. Phase chain (prompt chaining with gates)

| # | Phase | Main output | Gate (must exit 0) |
|---|---|---|---|
| 0 | Preflight | Empty repo, `git init`, `.nvmrc` | `node -v` matches 22.x; `docker compose version` |
| 1 | Scaffold | npm workspaces, tsconfig, ESLint, Vitest config with 100% thresholds, pinned deps, lockfile | `npm ci && npm run typecheck && npm run lint` |
| 2 | Contract | `contract/openapi.yaml` and `acceptance/` copied verbatim; contract-validation helper | `npm run contract:validate` (spec is valid OpenAPI 3.1) |
| 3 | Backend (TDD) | Backend built one behaviour at a time: failing test → see it fail → implement → green. Behaviour checklist in the file. | `npm -w backend run test:coverage` (100% all metrics) **and** `npm run acceptance:local` (starts server, runs Appendix B) |
| 4 | Frontend | React page, axios client, RTL + MSW tests | `npm -w frontend test && npm -w frontend run build` |
| 5 | Containerise | Dockerfiles, `docker-compose.yml`, nginx config | `docker compose up -d --wait` then acceptance suite against `http://localhost:8080/api`, then `docker compose down` |
| 6 | Final verify | `BUILD_REPORT.md`, README | `npm run verify` (typecheck, lint, all tests and coverage, contract validate, local acceptance, `npm audit`; Docker is not required, as it is gated separately in Phase 5) |

The backend behaviour checklist in Phase 3 is ordered so each item maps to one
red/green cycle: ping → create valid → each validation rule → duplicate ISBN →
get by id / 404 → list → each filter → unknown query param → malformed JSON →
wrong content type → oversized body → unknown route → unexpected error → 500
without leaking details → logging behaviour.

### A3. Decisions log (contents)

| Brief is silent on | Decision | Why |
|---|---|---|
| What an asset is | A book: title, author, optional ISBN, status | Domain is a library; ISBN gives a real-world identity |
| Status changes | Set on create (default `available`); no endpoint changes it | Brief only asks for create + list; adding PATCH is scope creep |
| Validation | Zod; trimmed strings; length limits; ISBN-10/13 checksum; unknown fields rejected | Fail loudly on malformed input instead of silently dropping it |
| Duplicates | ISBN unique (after normalisation) → 409; title/author may repeat | Multiple copies of a book without ISBN are legitimate |
| Malformed requests | One error envelope; 400/404/409/413/415/500 | Predictable for clients and tests |
| Persistence | In memory behind a `AssetRepository` interface; lost on restart | Brief doesn't assess storage; the interface makes swapping in a DB a one-file change |
| Filtering | `author` (case-insensitive exact), `status`, `q` (title substring), combined with AND; unknown params → 400 | "At least one filter"; strictness catches client typos |
| Ordering | `createdAt` ascending, ties broken by insertion order | Deterministic output across runs |
| Pagination | None | Out of scope for the size of data; recorded as a known limit |
| Auth | None | Not in brief; recorded as the first production gap |
| Health | `GET /ping` liveness only | Nothing downstream to check readiness against |
| Logging | Only failures + HTTP response status codes, JSON lines to stdout | Matches requirements; no bodies or query values, to avoid logging PII or injection content |
| CORS | Allow only `CORS_ORIGIN` | Least privilege |
| Malformed `{id}` | 404 (not 400) | From the client's view, no such resource |

### A4. Shelfwright eval harness (`eval/`)

Private tooling, excluded from the Nexus submission (or included separately as
evidence; examiner's call).

**Components**

- `eval/judge-instructions.md`: LLM-judge prompt that reviews `instructions.md`
  before each round for ambiguity, contradictions, unpinned behaviour, and
  instructions that depend on a particular agent tool. Output: list of findings.
  The examiner decides which to act on.
- `eval/run.sh <round> <N>`: for each of N runs:
  1. Create a clean temp dir containing **only** `instructions.md`.
  2. Run the agent headless (`claude -p`) in that dir, inside a Docker sandbox
     container with no host credentials mounted beyond the API key, plus a
     time limit.
  3. Save the full transcript.
- `eval/score.sh <run-dir>`: independently re-runs every phase gate, plus:
  - our **copy** of the acceptance suite (so a run that altered its own copy
    is caught);
  - checksum comparison of VERBATIM files against `instructions.md`;
  - logging-rule checks (start the server, exercise endpoints, assert stdout
    contains only `http_response` and `error` events);
  - coverage thresholds left untouched;
  - dependency list matches Appendix C exactly.
  Produces `scorecard.json`.
- `eval/diff-runs.sh <round>`: runs the same scripted request sequence against
  every run's server and diffs the responses (ignoring `id`/`createdAt`
  values). Any difference is a consistency failure.
- `eval/rounds/<n>/review.md`: generated per round. One section per run:
  scorecard summary, links to the generated repo, transcript, and diff output,
  plus an **examiner checklist** (things only a human can judge):
  - [ ] UI is usable: can register a book and filter the list
  - [ ] No code you would refuse to ship (security smells, dead code, hacks)
  - [ ] Decisions log followed; "Unspecified decisions" in BUILD_REPORT are acceptable
  - [ ] Transcript shows no weakened tests or skipped gates
  - Verdict: `PASS` / `FAIL`, plus notes

**Examiner rules**

- Automated scores are advisory; **the examiner's verdict is final**.
- A round passes only when the examiner marks every run PASS.
- `instructions.md` changes between rounds only with the examiner's approval;
  each change records which finding caused it (`eval/CHANGELOG.md`).
- Exit criterion for the Testing phase: one round of N=3 (default) with all
  runs PASS and zero differences from `diff-runs`.

---

## Part B — Library Asset Service (the requirements Shelfwright pins)

### B1. API contract (becomes Appendix A, VERBATIM)

**Asset**

| Field | Type | Rules |
|---|---|---|
| `id` | string (UUID v4) | Server-generated |
| `title` | string | Required; trimmed; 1–200 chars |
| `author` | string | Required; trimmed; 1–100 chars |
| `isbn` | string \| null | Optional; hyphens/spaces stripped; valid ISBN-10 or ISBN-13 checksum; stored normalised; unique |
| `status` | enum | `available` \| `on_loan` \| `lost`; default `available` |
| `createdAt` | string (ISO 8601 UTC) | Server-generated |

**Endpoints**

| Method & path | Success | Errors |
|---|---|---|
| `GET /ping` | `200 {"status":"ok"}` | — |
| `POST /assets` | `201` asset; `Location: /assets/{id}` | 400, 409, 413, 415 |
| `GET /assets/{id}` | `200` asset | 404 |
| `GET /assets?author=&status=&q=` | `200 {"data":[asset…]}` | 400 (invalid status value or unknown param) |

**Error envelope** (all non-2xx responses):

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Human readable", "details": [ { "field": "isbn", "issue": "invalid checksum" } ] } }
```

Codes: `VALIDATION_ERROR` (400, including malformed JSON), `NOT_FOUND` (404,
unknown route or id), `CONFLICT` (409), `PAYLOAD_TOO_LARGE` (413, body > 10kb),
`UNSUPPORTED_MEDIA_TYPE` (415, POST without `application/json`),
`INTERNAL_ERROR` (500, generic message, never a stack trace). `details` only
appears on `VALIDATION_ERROR`.

### B2. Backend

- TypeScript, Express 5, Zod, helmet, cors. Vitest + Supertest.
- Layout:

```
backend/src/
  app.ts            createApp({ repo, logger, clock, idGen }) → Express app (no listen)
  server.ts         reads PORT/CORS_ORIGIN, listens, handles SIGTERM (only file excluded from coverage)
  routes/assets.ts  HTTP ↔ domain mapping only
  domain/asset.ts   Zod schemas, ISBN normalise + checksum
  repo/             AssetRepository interface; InMemoryAssetRepository
  middleware/       requestLog, contentType, notFound, errorHandler
  logger.ts         JSON-lines wrapper over console
```

- Dependencies are injected, so tests use a fixed clock and sequential IDs.
- Coverage: 100% lines/branches/functions/statements, enforced by Vitest thresholds.
- Contract tests: every route test response is validated against
  `contract/openapi.yaml` through a shared helper (`expectToMatchContract`).
- Security: helmet, `x-powered-by` off, 10kb JSON limit, strict content type,
  CORS restricted to `CORS_ORIGIN`, generic 500s.

### B3. Logging (both tiers)

Only two kinds of event, as JSON lines on stdout/stderr:

- `{"level":"info","event":"http_response","method","path","status","durationMs"}`.
  Backend: one per response. Frontend: one per axios response or HTTP error
  (`method`, `url`, `status`).
- `{"level":"error","event":"error","name","message","stack"}`: any caught
  failure (backend error handler; frontend network failure or unexpected
  exception).

Nothing else: no startup banners, no debug lines, no request bodies, headers
or query values. Tests assert this by spying on the logger/console.

### B4. Frontend

- React + Vite + TypeScript, axios. RTL + MSW + Vitest.
- One page:
  - **Register form**: title, author, ISBN (optional), status select. Shows
    server validation `details` next to each field. Clears and refreshes the
    list on success.
  - **Asset list**: table (title, author, ISBN, status, created). Filter
    controls for author, status dropdown and title search (300ms debounce).
    Clicking a row is not required.
- `api/client.ts`: single axios instance, base URL `VITE_API_URL`
  (default `/api`), response and error interceptors that do the logging.
- Tests: form happy path, field-level errors, filtering sends the correct
  query, interceptor logging. MSW responses are validated against the contract.
  No coverage threshold.

### B5. Repo, build and deployment

```
/
  instructions.md        (Shelfwright, copied in by the run)
  BUILD_REPORT.md        (written by the agent in Phase 6)
  README.md
  package.json           (npm workspaces; scripts: typecheck, lint, test, contract:validate, acceptance:local, verify)
  .nvmrc                 (22)
  contract/openapi.yaml
  acceptance/
  backend/
  frontend/
  docker-compose.yml
```

- Exact pinned versions; lockfile committed; `npm ci` only.
- `backend/Dockerfile`: multi-stage, `node:22-alpine`, non-root user,
  `HEALTHCHECK` on `/ping`.
- `frontend/Dockerfile`: build stage, then `nginx:alpine` serving static files
  and proxying `/api/` to `backend:3000`.
- `docker compose up` → app on `http://localhost:8080`.

---

## 2. Workflow phases (ours)

1. **Planning**: this spec, then the implementation plan (writing-plans).
2. **Building**: write `instructions.md` (Shelfwright) including the
   appendices, and the eval harness. The contract and acceptance suite are
   hand-checked by us, since they are the oracles.
3. **Testing**: judge review → round of N runs → score → examiner review →
   approved changes to `instructions.md` → repeat until the exit criterion.
4. **Finalising**: commit the reference build from an accepted round; write
   the note for Nexus (agent and model, time, twice-the-time list); package
   the submission.

## 3. Risks and open points

- **Agent portability**: the harness only exercises Claude Code. Mitigations:
  the judge checks for tool-specific instructions; testing with a second agent
  is listed as a "twice the time" item.
- **Version drift**: pinned versions may later get security advisories. The
  final gate's `npm audit` will surface them, and BUILD_REPORT records them.
- **Docker unavailable on Nexus's machine**: Phases 0–4 and 6 do not need
  Docker; Phase 5 is marked skippable *with an explicit note in BUILD_REPORT*,
  never skipped silently.
- **Harness cost/time**: each run is a full agent build; N defaults to 3.

---

## 4. Amendments made during planning (2026-10-15)

These supersede the sections above where they conflict.

1. **Node 24 LTS**, not 22. Node 24 is the active LTS line; 22 is in maintenance.
2. **Pinned versions are at least 14 days old** when pinned (supply-chain cooldown), and every
   `npm install`/`npm ci` uses `--ignore-scripts`.
3. **More files are VERBATIM.** Besides the contract and acceptance suite, all configuration is
   pinned verbatim: every `package.json` (this replaces "Appendix C dependency list"), tsconfigs,
   ESLint, Vitest/Vite configs, Dockerfiles, nginx config, Compose file, `.gitignore`/`.dockerignore`.
   The agent writes application source and tests only.
4. **Pinned files are extracted, not retyped.** The agent hand-writes one ~30-line script
   (`scripts/verbatim.mjs`) that extracts every VERBATIM block from `instructions.md` and can later
   check them. This removes transcription errors as a source of variance.
5. **Phases renumbered**: 0 Preflight · 1 Extract pinned files and install · 2 Backend (TDD) ·
   3 Frontend · 4 Containers · 5 Final verification and report. The old "Contract" phase is part of Phase 1.
6. **`405 METHOD_NOT_ALLOWED`** with an `Allow` header for wrong methods on known paths (REST
   convention), alongside `404` for unknown paths.
7. **An empty POST body with a JSON content type is treated as `{}`** (so the errors are for
   `title`/`author`). This matches Express's body parser and avoids a special case.
8. **Error log lines are only for unexpected failures** (anything that becomes a 500, plus
   process-level errors). Client mistakes (4xx) only produce the HTTP response line.
9. **Eval sandbox has no Docker.** The agent container cannot run Docker, so in eval runs the agent
   records Phase 4 as skipped. The harness then runs the Phase 4 gate on the host with *our* copy of
   the acceptance suite, and only if the verbatim check passed (so we never build Dockerfiles that
   differ from ours).
10. **Scoring runs in a container** (`shelfwright-scorer`), because generated code should not run
    on the host and its `node_modules` are Linux builds.
11. **Tooling lives in `shelfwright/`.** The repo root stays free for the reference build that
    Finalising will commit.
12. **A golden fake server** (`shelfwright/fixtures/golden-server.ts`, plain `node:http`) implements
    the contract independently. It is used to prove the acceptance suite, probe and log checker are
    correct *before* spending agent runs, and its probe output is the accuracy baseline that every
    run is compared against.

---

## 5. Decisions recorded by the examiner (2026-10-15)

| Decision | Reason |
|---|---|
| **Exact package versions** everywhere (no ranges). | Exact versions are known to be safe. Pinning avoids pulling a newly published compromised release, a risk that is more common now that agents install packages autonomously. |
| **Docker is used to evaluate the agent** (sandboxed builder runs, isolated scoring). **Whether to containerise the app itself is decided at the end** (Finalising), not built into Shelfwright now. | Sandboxing untrusted, agent-written code is a requirement for evaluation; app containerisation is a delivery choice best made once the app is proven. |
| **The scorer cannot be fooled by a run editing its own oracle.** | The oracle (acceptance suite, golden baseline) lives only in the evaluator and is never shipped inside a build. Scoring re-runs every check independently. |
| **Evaluation lives outside Shelfwright**, above the agent and the app in the file structure. | Shelfwright stays a clean deliverable; the oracle is written once, not re-created in every build. |
| **A different agent scores the work** than the one that built it. | Independence: a builder grading itself has every incentive and blind spot to pass itself. |
| **The agent writes its own contract tests** from `contract/openapi.yaml` and the required endpoints, test-first (TDD). Verbatim content is cut to the minimum. | Less copied code; the agent proves it can derive tests from a contract, and the hidden oracle checks the result. |

## 6. Production features omitted from the tech demo

These would be added for a real application. They are recorded here and in `instructions.md` (decisions log) so the omission is visible, not accidental.

1. **A real database**: SQLite for small scale, PostgreSQL for larger deployments, behind the existing `AssetRepository` interface.
2. **Bulk CSV import** of a large number of books through the API (for example a `POST /assets/import` accepting `text/csv`, validated row by row, with a per-row error report).
3. Authentication and authorisation (already noted in the decisions log).

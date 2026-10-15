# Shelfwright: build instructions for the Library Asset Service

> You are a coding agent. This file is your complete brief. Follow it from top to bottom without
> asking questions. It is written so that different agents on different machines build services
> that behave identically.

## 1. Mission

Build the **Library Asset Service**, a small service for tracking books in a library:

- **Backend:** a Node.js + TypeScript REST API with `GET /ping`, `POST /assets`, `GET /assets` (filtered list) and `GET /assets/{id}`.
- **Frontend:** one React page that registers books (`POST /assets`) and lists them with filters (`GET /assets`), using axios.

The API contract in Appendix A (`contract/openapi.yaml`) and the decisions log in §4 define the
correct behaviour. Where they speak, follow them exactly.

## 2. Ground rules

These override any habit or default you have.

1. **Phases in order.** Each phase ends with a **gate** command. Do not start the next phase until the gate exits with code 0.
2. **Three strikes.** If the same gate fails three times in a row after genuine fixes, stop. Fill in `BUILD_REPORT.md` (Appendix B) with the failing command, its output and what you tried, then finish. Never fake a pass.
3. **Never weaken a check.**
   - Do not edit `contract/openapi.yaml` or lower the coverage thresholds.
   - Do not add `eslint-disable`, `@ts-ignore`, `@ts-expect-error` or `@ts-nocheck` comments; do not skip, focus or invert tests in any form (`.skip`, `.skipIf`, `.runIf`, `.only`, `.todo`, `.fails`, including chained forms such as `it.concurrent.skip`); and do not add `istanbul`/`v8`/`c8 ignore` comments.
   - Do not delete or loosen a test to make it pass. Do not exclude files from coverage beyond what §6 allows.
   - `eslint.config.js` disables inline ESLint configuration, and `npm run check:rules` (§6.4) searches the sources for every token listed above. `scripts/check-rules.mjs` is the only file allowed to contain these tokens, as search patterns.
4. **Dependencies are exact.** Use only the packages in the dependency table (§6.3), at exactly those versions, with no `^` or `~`. Do not add, remove or upgrade anything. Always pass `--ignore-scripts` to `npm install` and `npm ci`. Never run `npm audit fix`. Exact, known-safe versions avoid pulling a newly published compromised release. Never use `--force` or `--legacy-peer-deps`. If installation fails (for example ERESOLVE, or a version that does not exist), treat it as a gate failure under rule 2; record the exact error.
5. **No outside code.** Download nothing except npm packages, through npm. Never pipe anything from the network into a shell. Never let npm download a tool in order to run it: run tools only through the npm scripts in §6.2, or with `npm exec --no -- <tool>`, which refuses to download anything.
6. **No secrets.** The service has none. Configuration comes only from the environment variables in §4.4.
7. **Logging is restricted** (§4.3). Only `backend/src/logger.ts` and `frontend/src/logger.ts` may use `console`. ESLint and `npm run check:rules` enforce this.
8. **Where this file is silent,** choose the simplest option consistent with the contract and §4. Record every such choice under "Unspecified decisions" in `BUILD_REPORT.md`. There is nobody to ask.
9. **Commit as you go.** In Phase 2, commit after each checklist item (`backend <n>: <behaviour>`). Commit after every gate (`phase <n>: <name>`).

### 2.1 What not to do

Each of these mistakes is easy to make. The reference in parentheses points to what to do instead.

- Don't let a malformed URL become a 500. Map a `URIError` to `404 NOT_FOUND` (Phase 2, §2.2).
- Don't let body-parser errors that are not listed fall through to a 500 (Phase 2, §2.2).
- Don't invent error wording. Use the exact texts in §4.7.
- Don't count characters any way other than `.length` after `.trim()` (§4.1).
- Don't silence linters or tests. Inline ESLint configuration is disabled, and `npm run check:rules` searches for suppressions (rule 3, §6.4).
- Don't hand-edit versions, scripts or coverage thresholds. `npm run check:rules` compares them with §6.2, §6.3 and §6.1.
- Don't skip the frontend tests with the titles listed in Phase 3, §3.3.
- Don't skip `README.md` or `BUILD_REPORT.md`. `node scripts/check-rules.mjs --report` checks both (Phase 4).
- Don't run a tool in a way that lets npm download it. Use the npm scripts or `npm exec --no --` (rule 5).
- Don't run the first install without `--before=2026-10-01T00:00:00Z` (Phase 1 step 3).
- Don't use `--force` or `--legacy-peer-deps` (rule 4).
- Don't add a fallback for `req.body` that no test can reach. `parseNewAsset` handles `undefined` (Phase 2, §2.2).
- Don't let the smoke script leave a server running (Phase 2, §2.4).
- Don't guess where form errors go (Phase 3, §3.2).
- Don't send filters that are empty after trimming (Phase 3, §3.1).

## 3. Prerequisites

- A macOS or Linux shell.
- Node.js **24.x** with npm 10 or 11.
- git.
- Network access to the npm registry.

## 4. Decisions log

The original brief was silent on everything below. These decisions are final.

### 4.1 Domain

| Topic | Decision | Reason |
|---|---|---|
| What an asset is | A book: `title`, `author`, optional `isbn`, `status`, plus server-set `id` and `createdAt`. | The domain is a library; ISBN gives books a real-world identity. |
| `title` | Required string. Trimmed. 1–200 characters after trimming (characters as defined below the table). | Reject blank and runaway input. |
| `author` | Required string. Trimmed. 1–100 characters after trimming (characters as defined below the table). | As above. |
| `isbn` | Optional; `null` or omitted means "no ISBN". Spaces and hyphens are removed and `x` is upper-cased. It must then be a valid ISBN-10 (9 digits + digit or `X`, mod-11 checksum) or ISBN-13 (13 digits, mod-10 checksum). Stored and returned normalised. An empty string is invalid. | People type ISBNs with hyphens; one canonical form makes uniqueness meaningful. |
| ISBN uniqueness | No two assets share a normalised ISBN → `409 CONFLICT`. ISBN-10 and ISBN-13 forms of the same book are **not** treated as equal. Assets without an ISBN may share title and author. | Catch double registration; libraries hold copies of items without ISBNs. |
| `status` | `available` \| `on_loan` \| `lost`; default `available`. Set only at creation. No endpoint changes it. | The brief asks for register and list only. |
| `id` | UUID v4 from `crypto.randomUUID()`. | Unguessable; no coordination. |
| `createdAt` | `new Date().toISOString()` at creation (UTC). | |
| Unknown POST fields | Rejected with `400`; one detail per unknown field, `field` = its name. | Fail loudly; silent dropping hides client bugs. |
| Persistence | In memory, behind an async `AssetRepository` interface. Data is lost on restart. | Enough for this service. The interface makes a database a one-file change (§4.6). |

Everywhere in this file, a length in "characters" means UTF-16 code units as measured by `String.prototype.length` after `String.prototype.trim()`: the length of `value` is `value.trim().length`. For example, `📚` counts as 2 characters, so a title of 100 `📚` is accepted and a title of 101 is too long.

### 4.2 HTTP behaviour

| Topic | Decision |
|---|---|
| Base path | The backend serves `/ping` and `/assets` at its root. The frontend reaches it through `/api`, which the Vite dev proxy strips. |
| Filters on `GET /assets` | `author`: case-insensitive exact match. `status`: one of the enum values. `q`: case-insensitive substring of `title`. All values are trimmed first (`String.prototype.trim()`). Filters combine with AND. |
| Invalid query | An unknown parameter, a repeated parameter, a value that is empty after trimming, `author` over 100 characters, `q` over 200 characters (characters as defined in §4.1), or an unknown `status` → `400 VALIDATION_ERROR` with a detail whose `field` is the parameter name. |
| List order and shape | Creation order, oldest first. Body `{"data": [...]}`. No pagination. |
| `GET /assets/{id}` | `200` with the asset. Otherwise `404 NOT_FOUND`, including ids that are not UUIDs or have malformed percent-encoding. |
| `POST /assets` success | `201`; the body is the created asset; header `Location: /assets/<id>`. |
| Content type | `POST /assets` needs a `Content-Type` whose media type (before any `;`, trimmed) is `application/json`, case-insensitive. Otherwise `415 UNSUPPORTED_MEDIA_TYPE`. This is checked before the body is read. Do **not** use `req.is()` for this, because it returns `null` when there is no body. |
| Body size | More than 10 kb (10240 bytes) → `413 PAYLOAD_TOO_LARGE`. |
| Body shape | Malformed JSON, or a JSON value that is not an object → `400 VALIDATION_ERROR` with detail `field: "body"`. An empty body with a JSON content type, or a request with no body at all, is treated as `{}`. A body that cannot be read (for example because the client aborts the request before the body is complete) → `400 VALIDATION_ERROR` with detail `field: "body"`. An unsupported `Content-Encoding` (for example `compress`) or charset → `415 UNSUPPORTED_MEDIA_TYPE`. |
| Wrong method | `405 METHOD_NOT_ALLOWED` with the header `Allow: GET, POST` for `/assets`, and `Allow: GET` for `/assets/{id}` and `/ping`. |
| Unknown path | `404 NOT_FOUND`. |
| Unexpected failure | `500 INTERNAL_ERROR` with the message `Internal server error`. Never send stack traces or internal messages. |
| Error body | Always `{"error": {"code", "message", "details"?}}`. `details` (an array of `{field, issue}`, at least one) appears on `VALIDATION_ERROR` and on nothing else. `message` and `issue` texts are fixed by §4.7. |
| Health | `GET /ping` → `200 {"status":"ok"}`. Liveness only. |
| CORS | `cors({ origin: CORS_ORIGIN })`: that origin only. |
| Security headers | `helmet()` defaults, with `X-Powered-By` disabled. |

### 4.3 Observability

There are exactly two kinds of log event, each written as one JSON object per line.

1. **`http_response`**: one per HTTP response.
   - **Backend.** Written to stdout with `console.log` when the response finishes:
     `{"level":"info","event":"http_response","method":"GET","path":"/assets","status":200,"durationMs":3.2}`.
     `path` excludes the query string. Never log bodies, headers or query values; they may hold personal data or injected content.
   - **Frontend.** Written with `console.info` for every axios response, including 4xx and 5xx:
     `{"level":"info","event":"http_response","method":"GET","url":"/api/assets","status":200}`.
     `url` is `baseURL + url` without any query string.
2. **`error`**: one per unexpected failure in code, written with `console.error`:
   `{"level":"error","event":"error","name":"TypeError","message":"…","stack":"…"}`.
   A thrown value that is not an `Error` is logged with name `NonError`, `message` set to `String(value)`, and no `stack`.
   - **Backend.** Any error that becomes a `500`; `uncaughtException`; `unhandledRejection`; `listen` errors.
   - **Frontend.** Axios requests that get no response (network failure), and uncaught errors and unhandled rejections in the page.
   - Client mistakes (4xx) are **not** failures in code. They produce only the `http_response` line.

Nothing else is logged: no startup banner and no debug output.

### 4.4 Configuration

| Variable | Used by | Default |
|---|---|---|
| `PORT` | backend | `3000` |
| `CORS_ORIGIN` | backend | `http://localhost:5173` |
| `VITE_API_URL` | frontend, at build time | `/api` |

### 4.5 Toolchain and quality

| Topic | Decision |
|---|---|
| Language | TypeScript (strict), ES modules everywhere. |
| Libraries | Express 5, Zod 4, helmet, cors; React 19 + Vite 7; axios; Vitest 4 + Supertest; React Testing Library + MSW 2; Ajv for contract checks. |
| Versions | Exact pins only. The pins were chosen from releases that had been public for at least 14 days; you do not need to check this. Exact, known-safe versions avoid newly published compromised releases, a risk that is more common now that agents install packages. The first install uses `npm install --ignore-scripts --before=2026-10-01T00:00:00Z`, which resolves every package, including transitive ones, to versions published before that date. Every build therefore gets the same dependency tree, whenever it runs. The resulting `package-lock.json` is committed, and later installs use `npm ci --ignore-scripts`. |
| Install scripts | Disabled (`--ignore-scripts`) everywhere, to shrink the supply-chain attack surface. |
| Test-driven development | Every behaviour starts as a failing test. This includes the contract tests, which you write yourself from `contract/openapi.yaml` before the code they check. |
| Contract tests | `contract/contract-helper.ts` validates bodies against `contract/openapi.yaml`. Every backend HTTP test and every frontend mock response goes through it. |
| Backend coverage | 100% lines, branches, functions and statements. `backend/src/server.ts` is the only exclusion. |
| Frontend tests | Behavioural tests for the form, the list and filters, and API logging, including the titled tests in Phase 3, §3.3. No coverage threshold. |
| Validation | The server is the single source of truth. The frontend does not repeat the rules and has no `required` attributes; it shows the server's `details`. |

### 4.6 Not included in this build

These would be added for a production service. They are deliberately left out here.

| Feature | Production approach |
|---|---|
| Persistent database | SQLite for small scale, PostgreSQL for larger deployments, implemented behind `AssetRepository`. |
| Bulk import | A CSV import of a large number of books through the API (for example `POST /assets/import` with `text/csv`), validated row by row with a per-row error report. |
| Authentication and authorisation | Required before any real deployment. |
| Deployment packaging | Containers and a deployment pipeline, decided separately. |

### 4.7 Error text (exact)

Use these texts character for character.

Messages, by error code:

| Code | `message` |
|---|---|
| `VALIDATION_ERROR` | `Request is invalid` |
| `NOT_FOUND` | `Resource not found` |
| `METHOD_NOT_ALLOWED` | `Method not allowed` |
| `CONFLICT` | `An asset with this ISBN already exists` |
| `PAYLOAD_TOO_LARGE` | `Request body must be 10 kb or smaller` |
| `UNSUPPORTED_MEDIA_TYPE` | `Content-Type must be application/json` |
| `INTERNAL_ERROR` | `Internal server error` |

Issues, by rule. Each row gives the detail's `field` and `issue`:

| Rule | `field` | `issue` |
|---|---|---|
| `title` or `author` is missing or not a string | `title` / `author` | `is required and must be a string` |
| `title` is empty or over 200 characters after trimming | `title` | `must be 1-200 characters` |
| `author` is empty or over 100 characters after trimming | `author` | `must be 1-100 characters` |
| `isbn` is neither a string nor `null`, is empty, or fails the format or checksum after normalising | `isbn` | `must be a valid ISBN-10 or ISBN-13` |
| `status` is not one of the values (body or query, including an empty query value) | `status` | `must be one of available, on_loan, lost` |
| Unknown body field | its name | `is not allowed` |
| The parsed body is not an object: `parseNewAsset` receives `null`, an array or a string, for example. Over HTTP, only an array reaches this rule (see the next row) | `body` | `must be a JSON object` |
| Malformed JSON. This includes a top-level value other than an object or array, such as `null` or `"text"`, which `express.json()` rejects in its default strict mode | `body` | `must be valid JSON` |
| The body could not be read | `body` | `could not be read` |
| Unknown query parameter | its name | `is not a supported filter` |
| Repeated query parameter | its name | `must be given once` |
| `author` filter is empty or over 100 characters after trimming | `author` | `must be 1-100 characters` |
| `q` filter is empty or over 200 characters after trimming | `q` | `must be 1-200 characters` |

Rules:
- Each field gets at most one issue: the first check it fails. For a body field, the type check comes before the length or format check. For a query parameter, the checks run in this order: unknown, then repeated, then the value check.
- A body that is not an object gets only the `body` issue.
- Order of `details` for a body: `title`, `author`, `isbn`, `status`, then unknown fields in the order they appear in the input.
- Order of `details` for a query: `author`, `status`, `q`, then unknown parameters in the order they first appear in the query string.

## 5. Target layout

```
.
├── instructions.md  BUILD_REPORT.md  README.md
├── .nvmrc  .gitignore  package.json  package-lock.json
├── tsconfig.base.json  tsconfig.json  eslint.config.js
├── contract/    openapi.yaml  validate-spec.ts  contract-helper.ts  contract-helper.test.ts
├── scripts/     smoke.ts  check-rules.mjs
├── backend/
│   ├── package.json  tsconfig.json  tsconfig.build.json  vitest.config.ts
│   ├── src/
│   │   ├── server.ts  app.ts  logger.ts  errors.ts
│   │   ├── domain/asset.ts
│   │   ├── repo/asset-repository.ts
│   │   ├── routes/ping.ts  routes/assets.ts
│   │   └── middleware/request-log.ts  require-json.ts  method-not-allowed.ts  not-found.ts  error-handler.ts
│   └── test/
│       ├── support/test-app.ts
│       ├── domain/  repo/  http/   (*.test.ts)
│       └── logger.test.ts
└── frontend/
    ├── package.json  tsconfig.json  vite.config.ts  index.html
    └── src/
        ├── main.tsx  App.tsx  App.test.tsx  logger.ts  styles.css
        ├── api/types.ts  client.ts  client.test.ts  assets.ts
        ├── components/AssetForm.tsx  AssetForm.test.tsx  AssetFilters.tsx  AssetList.tsx
        ├── hooks/useDebouncedValue.ts
        └── test/setup.ts  server.ts
```

Do not create files outside this layout, except extra test files under `backend/test/`, `frontend/src/` or `contract/`.

## 6. Project configuration

### 6.1 Files to create

- `.nvmrc` contains `24`.
- `.gitignore` lists `node_modules/`, `dist/`, `coverage/`, `*.log`, `.env`, `.env.*`.
- `package.json` (root):
  - `"name": "library-asset-service"`, `"private": true`, `"type": "module"`;
  - `"engines": { "node": ">=24 <25" }`;
  - `"workspaces": ["backend", "frontend"]`;
  - `scripts` and `devDependencies` exactly as in §6.2 and §6.3.
- `backend/package.json` and `frontend/package.json`:
  - `"name"` is `"backend"` or `"frontend"`, with `"private": true` and `"type": "module"`;
  - `scripts`, `dependencies` and `devDependencies` exactly as in §6.2 and §6.3.
  No manifest may have install hooks (`preinstall`, `install`, `postinstall`, `prepare`), or a `peerDependencies`, `optionalDependencies`, `bundleDependencies`, `bundledDependencies`, `overrides` or `resolutions` field.
- `tsconfig.base.json` has these `compilerOptions`:
  - `"target": "ES2023"`, `"lib": ["ES2023"]`;
  - `"module": "ESNext"`, `"moduleResolution": "Bundler"`;
  - `"strict": true`, `"esModuleInterop": true`, `"skipLibCheck": true`;
  - `"isolatedModules": true`, `"resolveJsonModule": true`;
  - `"forceConsistentCasingInFileNames": true`, `"noFallthroughCasesInSwitch": true`.
- `tsconfig.json` (root): extends `./tsconfig.base.json`; `"noEmit": true`; `"types": ["node"]`; includes `contract/**/*.ts` and `scripts/**/*.ts`.
- `backend/tsconfig.json`: extends `../tsconfig.base.json`; `"noEmit": true`; `"types": ["node"]`; includes `src`, `test` and `vitest.config.ts`.
- `backend/tsconfig.build.json`: extends `./tsconfig.json`; `"noEmit": false`, `"outDir": "dist"`, `"rootDir": "src"`; includes only `src`. `npm run build -w backend` must produce `backend/dist/server.js`.
- `frontend/tsconfig.json`: extends `../tsconfig.base.json`; `"noEmit": true`, `"jsx": "react-jsx"`; `"lib": ["ES2023", "DOM", "DOM.Iterable"]`; `"types": ["node", "vite/client"]`; includes `src` and `vite.config.ts`.
- `eslint.config.js` uses `defineConfig` from `eslint/config`:
  - ignores `**/dist/**`, `**/coverage/**` and `**/node_modules/**`;
  - extends `@eslint/js` recommended and `typescript-eslint` recommended;
  - sets `globals.node` and `globals.browser`;
  - sets `no-console: "error"` everywhere, turned off only for `backend/src/logger.ts` and `frontend/src/logger.ts`;
  - sets `linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' }`, so comments cannot change the configuration.
  No other rule may be disabled.
- `backend/vitest.config.ts`:
  - includes `test/**/*.test.ts`, with `restoreMocks: true`;
  - coverage uses provider `v8`, includes `src/**/*.ts` and excludes only `src/server.ts`;
  - coverage reporters are `text` and `json-summary`, so `backend/coverage/coverage-summary.json` is written;
  - thresholds are `lines`, `branches`, `functions` and `statements`, all at `100`.
- `frontend/vite.config.ts` uses `defineConfig` from `vitest/config`:
  - plugin `@vitejs/plugin-react`;
  - dev server on port `5173`, proxying `/api` to `http://localhost:3000` with the `/api` prefix removed;
  - `test` settings: environment `jsdom`, `setupFiles: ['./src/test/setup.ts']`, include `src/**/*.test.{ts,tsx}`, `restoreMocks: true`.
- `contract/validate-spec.ts` calls `SwaggerParser.validate()` from `@apidevtools/swagger-parser` on `contract/openapi.yaml`. It resolves that path from `import.meta.url` and prints nothing on success.

### 6.2 Scripts (exact)

<!-- SCRIPTS-BEGIN -->
| Workspace | Script | Command |
|---|---|---|
| root | `typecheck` | `tsc -p tsconfig.json && npm run typecheck --workspaces` |
| root | `lint` | `eslint .` |
| root | `check:rules` | `node scripts/check-rules.mjs` |
| root | `contract:validate` | `tsx contract/validate-spec.ts` |
| root | `test:contract` | `vitest run --dir contract` |
| root | `test` | `npm run test:contract && npm run test:coverage -w backend && npm run test -w frontend` |
| root | `smoke` | `npm run build -w backend && tsx scripts/smoke.ts` |
| root | `verify` | `npm run check:rules && npm run typecheck && npm run lint && npm run contract:validate && npm test && npm run build -w frontend && npm run smoke` |
| backend | `dev` | `tsx watch src/server.ts` |
| backend | `build` | `tsc -p tsconfig.build.json` |
| backend | `start` | `node dist/server.js` |
| backend | `typecheck` | `tsc -p tsconfig.json` |
| backend | `test` | `vitest run` |
| backend | `test:coverage` | `vitest run --coverage` |
| frontend | `dev` | `vite` |
| frontend | `build` | `tsc -p tsconfig.json && vite build` |
| frontend | `typecheck` | `tsc -p tsconfig.json` |
| frontend | `test` | `vitest run` |
<!-- SCRIPTS-END -->

### 6.3 Dependencies (exact versions)

<!-- DEPENDENCIES-BEGIN -->
| Workspace | Section | Package | Version |
|---|---|---|---|
| root | devDependencies | `@apidevtools/swagger-parser` | `12.1.0` |
| root | devDependencies | `@eslint/js` | `10.0.1` |
| root | devDependencies | `@types/node` | `24.19.0` |
| root | devDependencies | `@vitest/coverage-v8` | `4.1.11` |
| root | devDependencies | `ajv` | `8.20.0` |
| root | devDependencies | `ajv-formats` | `3.0.1` |
| root | devDependencies | `eslint` | `10.11.0` |
| root | devDependencies | `globals` | `16.5.0` |
| root | devDependencies | `tsx` | `4.23.15` |
| root | devDependencies | `typescript` | `5.9.3` |
| root | devDependencies | `typescript-eslint` | `8.71.0` |
| root | devDependencies | `vitest` | `4.1.11` |
| root | devDependencies | `yaml` | `2.9.1` |
| backend | dependencies | `cors` | `2.8.6` |
| backend | dependencies | `express` | `5.2.1` |
| backend | dependencies | `helmet` | `8.3.0` |
| backend | dependencies | `zod` | `4.6.5` |
| backend | devDependencies | `@types/cors` | `2.8.19` |
| backend | devDependencies | `@types/express` | `5.0.6` |
| backend | devDependencies | `@types/supertest` | `7.2.1` |
| backend | devDependencies | `supertest` | `7.3.0` |
| frontend | dependencies | `axios` | `1.20.0` |
| frontend | dependencies | `react` | `19.3.0` |
| frontend | dependencies | `react-dom` | `19.3.0` |
| frontend | devDependencies | `@testing-library/dom` | `10.4.2` |
| frontend | devDependencies | `@testing-library/jest-dom` | `6.9.1` |
| frontend | devDependencies | `@testing-library/react` | `16.3.3` |
| frontend | devDependencies | `@testing-library/user-event` | `14.6.7` |
| frontend | devDependencies | `@types/react` | `19.3.0` |
| frontend | devDependencies | `@types/react-dom` | `19.3.0` |
| frontend | devDependencies | `@vitejs/plugin-react` | `5.2.0` |
| frontend | devDependencies | `jsdom` | `27.4.0` |
| frontend | devDependencies | `msw` | `2.15.0` |
| frontend | devDependencies | `vite` | `7.3.6` |
<!-- DEPENDENCIES-END -->

### 6.4 Rule check script (`scripts/check-rules.mjs`)

Write `scripts/check-rules.mjs` in Phase 1. It is plain Node.js (ES module) and imports nothing except Node built-ins (`node:fs`, `node:path` and so on). It writes each problem as one line with `process.stderr.write` (never `console`). It exits 1 if it found any problem and 0 otherwise. It reads files relative to the repository root, its working directory under `npm run check:rules`.

It checks:
1. **Manifests.** It reads the §6.2 and §6.3 tables from `instructions.md`: the rows between the `SCRIPTS-BEGIN` and `SCRIPTS-END` HTML comments, and between the `DEPENDENCIES-BEGIN` and `DEPENDENCIES-END` HTML comments. For each of `package.json`, `backend/package.json` and `frontend/package.json`:
   - `dependencies` and `devDependencies` equal that workspace's table rows exactly: the same package names, the same version strings, and no extras. A section with no rows must be absent or empty.
   - `scripts` equals that workspace's table rows exactly, with no extras.
   - There is no `peerDependencies`, `optionalDependencies`, `bundleDependencies`, `bundledDependencies`, `overrides` or `resolutions` field.
   - There is no `preinstall`, `install`, `postinstall` or `prepare` script.
2. **Coverage thresholds.** `backend/vitest.config.ts` contains `lines: 100`, `branches: 100`, `functions: 100` and `statements: 100`.
3. **Suppressions.** It scans the `.ts`, `.tsx`, `.js` and `.mjs` files under `backend/src`, `backend/test`, `frontend/src`, `contract` and `scripts`. It skips folders that do not exist yet, any `node_modules`, `dist` or `coverage` folder, and `scripts/check-rules.mjs` itself. A problem is any line containing:
   - `eslint-disable`, `@ts-ignore`, `@ts-expect-error` or `@ts-nocheck`;
   - a test modifier `.skip`, `.skipIf`, `.runIf`, `.only`, `.todo` or `.fails` on `it`, `test`, `describe` or `suite`, including chained forms such as `it.concurrent.skip`;
   - an `istanbul ignore`, `v8 ignore` or `c8 ignore` comment;
   - `console.` in a file under `backend/src` or `frontend/src` that is not a test file (`*.test.ts`, `*.test.tsx` or under `frontend/src/test/`) and is not `backend/src/logger.ts` or `frontend/src/logger.ts`.
4. **Frontend test titles.** If `frontend/src` exists, every test title listed in §3.3 appears, as the exact title string, in at least one `frontend/src/**/*.test.ts` or `*.test.tsx` file. The script holds the 13 titles as a constant.
5. **Report files**, only when run as `node scripts/check-rules.mjs --report`:
   - `README.md` has the nine `## ` headings listed in Phase 4 step 1, with exactly those texts;
   - `BUILD_REPORT.md` exists, every phase row (`0 Preflight` to `4 Verify`) in its "Phase results" table has a non-empty Result, and every `## ` section has some text before the next heading.

## 7. Phases

### Phase 0: Preflight

1. Run `node --version`, `npm --version` and `git --version`. If Node is not 24.x, stop now and report it (ground rule 2).
2. Make sure the working directory contains this file as `instructions.md`. If you received the text another way, save it unchanged as `instructions.md`.
3. Run `git init` if this is not already a git repository. If `git config user.email` prints nothing, set a repo-local identity: `git config user.name "Shelfwright"` and `git config user.email "shelfwright@example.invalid"`.

**Gate:** `node -e "process.exit(process.versions.node.startsWith('24.') ? 0 : 1)"`
Commit: `phase 0: preflight`.

### Phase 1: Scaffold

1. Copy the contract from Appendix A to `contract/openapi.yaml`, byte-for-byte. Take every line after the line consisting of four backticks followed by `yaml`, up to but not including the next line consisting of exactly four backticks, and keep the final newline. The gate checks its SHA-256. If the check fails, copy it again rather than editing it.
2. Create every file in §6.1, with `scripts` and dependencies exactly as in §6.2 and §6.3, and write `scripts/check-rules.mjs` (§6.4).
3. Run `npm install --ignore-scripts --before=2026-10-01T00:00:00Z`. This creates `package-lock.json`. `--before` resolves every package, including transitive ones, to versions published before that date, so every build gets the same dependency tree regardless of when it runs. Use this exact command for any later `npm install` too.

**Gate:**

```sh
node -e "const {createHash}=require('node:crypto');const {readFileSync}=require('node:fs');process.exit(createHash('sha256').update(readFileSync('contract/openapi.yaml')).digest('hex')==='{{CONTRACT_SHA256}}'?0:1)" && npm run contract:validate && npm exec --no -- tsc -p tsconfig.json && npm run lint && npm run check:rules
```

Commit: `phase 1: scaffold`.

### Phase 2: Contract tests and backend, test-first

Every item below is one TDD cycle:
1. write a failing test;
2. run it and see it fail for the expected reason;
3. write the minimum code to make it pass;
4. run all the relevant tests;
5. refactor with the tests green;
6. commit (`backend <n>: <behaviour>`).

Write no production code that a failing test did not ask for.

#### 2.0 Contract helper first

Write `contract/contract-helper.test.ts` **before** `contract/contract-helper.ts`. The helper exports:

```ts
export function assertMatchesContract(method: string, pathTemplate: string, status: number, body: unknown): void;
export function assertMatchesSchema(schemaName: string, body: unknown): void;
```

How it works:
- It loads `contract/openapi.yaml` (resolved from `import.meta.url`) with `yaml`.
- It validates with Ajv's JSON Schema 2020-12 build (`ajv/dist/2020.js`) plus `ajv-formats`, using `strict: false`.
- It follows a response's `$ref` into `components.responses`, then validates against `content["application/json"].schema`.
- To compile a `$ref` into the loaded document, add the document with `ajv.addSchema(doc, 'openapi.json')`. Compile `{ $ref: 'openapi.json#/<pointer>' }`, where each JSON-pointer segment is escaped (`~` → `~0`, `/` → `~1`) and then percent-encoded. This turns `/assets/{id}` into `~1assets~1%7Bid%7D`.

Error messages:
- On a mismatch it throws an `Error` containing `does not match the contract` and Ajv's error text.
- For an undefined operation, status or schema it throws `Contract has no operation <METHOD> <path>`, `Contract has no <status> response for <METHOD> <path>` or `Contract has no schema <name>`.

Write tests for these, all of which pass once the helper exists:
- a valid asset for `POST /assets` 201;
- a `null` ISBN, through the `/assets/{id}` template;
- an extra property and an un-normalised ISBN are rejected;
- a list response is accepted;
- `VALIDATION_ERROR` requires `details`, and other codes reject `details`;
- a 404 that goes through a shared response component;
- an undefined operation, status and schema each throw the right message.

Run them with `npm run test:contract`.

#### 2.1 Backend module interfaces (export exactly these names)

```ts
// backend/src/domain/asset.ts
export const ASSET_STATUSES = ['available', 'on_loan', 'lost'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];
export interface Asset { id: string; title: string; author: string; isbn: string | null; status: AssetStatus; createdAt: string }
export interface NewAsset { title: string; author: string; isbn: string | null; status: AssetStatus }
export interface AssetFilter { author?: string; status?: AssetStatus; q?: string }
export interface FieldIssue { field: string; issue: string }
export type ParseResult<T> = { ok: true; value: T } | { ok: false; issues: FieldIssue[] };
export function normaliseIsbn(raw: string): string;
export function isValidIsbn(normalised: string): boolean;
export function parseNewAsset(body: unknown): ParseResult<NewAsset>;                          // uses Zod; never throws; undefined is treated exactly like {}
export function parseAssetFilter(query: Record<string, unknown>): ParseResult<AssetFilter>;  // never throws

// backend/src/repo/asset-repository.ts
export interface AssetRepository {
  add(asset: Asset): Promise<void>;
  findById(id: string): Promise<Asset | undefined>;
  findByIsbn(isbn: string): Promise<Asset | undefined>;
  list(filter: AssetFilter): Promise<Asset[]>; // creation order; filter semantics from §4.2; returns copies
}
export class InMemoryAssetRepository implements AssetRepository { /* … */ }

// backend/src/logger.ts
export interface HttpResponseLog { method: string; path: string; status: number; durationMs: number }
export interface Logger { httpResponse(entry: HttpResponseLog): void; error(err: unknown): void }
export const consoleLogger: Logger; // the only backend module allowed to use console

// backend/src/errors.ts
export type ErrorCode = 'VALIDATION_ERROR' | 'NOT_FOUND' | 'METHOD_NOT_ALLOWED' | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE' | 'UNSUPPORTED_MEDIA_TYPE' | 'INTERNAL_ERROR';
export class HttpError extends Error {
  constructor(status: number, code: ErrorCode, message: string, details?: FieldIssue[]);
  readonly status: number; readonly code: ErrorCode; readonly details?: FieldIssue[];
}

// backend/src/app.ts
export interface AppDeps { repo: AssetRepository; logger: Logger; clock: () => Date; idGen: () => string; corsOrigin: string }
export function createApp(deps: AppDeps): import('express').Express; // never calls listen
```

Keep type declarations inside these runtime modules. Do not create type-only modules under `backend/src/`.

`backend/src/server.ts`:
- reads `PORT` and `CORS_ORIGIN`;
- builds the app with `InMemoryAssetRepository`, `consoleLogger`, `() => new Date()` and `randomUUID` from `node:crypto`, and listens on `PORT` with no host argument (`app.listen(port)`), so it accepts IPv4 and IPv6 connections;
- on `listen` errors, `uncaughtException` and `unhandledRejection`, calls `consoleLogger.error` and exits with code 1;
- closes the server on `SIGTERM` and `SIGINT`;
- logs nothing on startup.

Relative imports inside `backend/` end in `.js` (for example `./app.js`), because the compiled server
runs on Node's ES module loader. Tests in `backend/test/http/` import the helper from
`../../../contract/contract-helper.js`.

#### 2.2 App wiring, in this order inside `createApp`

1. `app.disable('x-powered-by')`.
2. `requestLog(logger)`: notes the start time; on the response's `finish` event, calls `logger.httpResponse` with the method, `req.originalUrl.split('?')[0]`, the status and the elapsed milliseconds.
3. `helmet()`.
4. `cors({ origin: corsOrigin })`.
5. Routes from `routes/ping.ts` and `routes/assets.ts`, using `router.route(path)`. Each route ends with `.all(methodNotAllowed('<Allow value>'))`. The `POST /assets` chain is `requireJson` → `express.json({ limit: '10kb' })` → handler. The handler passes `req.body` directly to `parseNewAsset`. Express leaves `req.body` undefined when a request has no body at all, and `parseNewAsset(undefined)` treats `undefined` exactly like `{}`.
6. `notFound` → `404 NOT_FOUND`.
7. `errorHandler`, mapping errors as follows, checked in this order (messages and issues from §4.7):
   - `HttpError` → its status, code and details;
   - body-parser `type === 'entity.too.large'` → 413 `PAYLOAD_TOO_LARGE`;
   - `type === 'encoding.unsupported'` or `'charset.unsupported'` → 415 `UNSUPPORTED_MEDIA_TYPE`;
   - `type === 'entity.parse.failed'` → 400 `VALIDATION_ERROR`, detail `{ field: 'body', issue: 'must be valid JSON' }`;
   - a `URIError` (Express raises one with `status` 400 when a path parameter has malformed percent-encoding, for example `/assets/%E0%A4%A`) → 404 `NOT_FOUND`;
   - any other error that has a numeric `status` from 400 to 499 and `expose === true` (other body-parser errors, such as `request.size.invalid` or `request.aborted`) → 400 `VALIDATION_ERROR`, detail `{ field: 'body', issue: 'could not be read' }`;
   - anything else → `logger.error(err)`, then `500 INTERNAL_ERROR`.

   None of the 4xx mappings is logged as an `error`.

Express 5 forwards rejected promises from async handlers to the error handler, so no wrappers are needed.

#### 2.3 Backend checklist (one TDD cycle each, in this order)

First create `backend/test/support/test-app.ts`. It exports `makeTestApp(overrides?: Partial<AppDeps>)`,
which returns `{ app, repo, logs }`:
- The clock is fixed at `2026-01-01T00:00:00.000Z`.
- Ids are sequential valid UUIDs: `00000000-0000-4000-8000-000000000001`, `…002`, and so on.
- `corsOrigin` is `http://localhost:5173`.
- `logs` is an in-memory `Logger` that records calls in `logs.responses` and `logs.errors`.

Every HTTP test validates its response body with `assertMatchesContract(method, pathTemplate, status, body)`.
For an unknown route (404) and for 405 responses, which have no contract operation, it uses
`assertMatchesSchema('Error', body)` instead. The CORS preflight in item 21 (204, empty body) is not body-validated.

Domain (`test/domain/`):
1. `normaliseIsbn` removes spaces and hyphens and upper-cases `x`.
2. `isValidIsbn` accepts `0306406152`, `080442957X` and `9780306406157`. It rejects a wrong checksum (`0306406153`, `9780306406158`), the wrong length, any letter except a final `X` on ISBN-10, and `X` in an ISBN-13.
3. `parseNewAsset` on a valid minimal body returns defaults (`isbn: null`, `status: 'available'`) and trimmed strings.
4. `parseNewAsset` reports the right `field` for:
   - `title` and `author` that are missing, blank, too long or not strings;
   - an invalid or non-string `isbn`;
   - an invalid `status`;
   - each unknown key (field = the key);
   - a body that is `null`, an array or a string (field `body`);
   - `undefined`, which gives the same issues as `{}` (fields `title` and `author`);
   - a `title` of 100 `📚` is accepted and one of 101 is too long (§4.1).
   Every issue text is exactly as in §4.7. Several problems produce one issue per field, in the §4.7 order.
5. `parseAssetFilter`:
   - `{}` → `{}`;
   - each valid filter is trimmed and returned;
   - errors for: an unknown key, a repeated key (array value), a value blank after trimming, `author` > 100, `q` > 200, an invalid `status`, with the §4.7 issue texts and order.

Repository (`test/repo/`):
6. `add`, then `findById` / `findByIsbn`; a missing value gives `undefined`.
7. `list`:
   - returns creation order;
   - filters by author (case-insensitive exact), status, and `q` (case-insensitive title substring);
   - combines filters with AND;
   - mutating a returned array or asset does not change the store.

Logger (`test/logger.test.ts`; spy with `vi.spyOn(console, 'log')` and `vi.spyOn(console, 'error')` and assert on the returned spies):
8. `httpResponse` writes exactly one JSON line with `level`, `event`, `method`, `path`, `status` and `durationMs`.
9. `error` writes `name`, `message` and `stack` for an `Error`, and `NonError` for a thrown non-Error value.

HTTP (`test/http/`, Supertest against `makeTestApp().app`):
10. `GET /ping` → 200 `{ status: 'ok' }`. `POST /ping` → 405 with `Allow: GET`.
11. A valid `POST /assets` → 201. The body equals the stored asset with the fixed id and `createdAt`, plus `Location: /assets/<id>`.
12. `POST /assets` validation errors → 400 with message `Request is invalid` and the §4.7 issue texts (one case per rule; the domain tests cover the rest).
13. A duplicate ISBN, including one formatted differently, → 409 `CONFLICT`.
14. `POST /assets` with `text/plain`, or with no `Content-Type`, → 415.
15. `POST /assets` responses:
    - malformed JSON → 400 with field `body`;
    - an empty body with a JSON content type → 400 with fields `title` and `author`;
    - a body over 10 kb → 413.
16. `GET /assets/:id` → 200; an unknown id → 404; `PUT /assets/:id` → 405 with `Allow: GET`. `GET /assets/%E0%A4%A` → 404 `NOT_FOUND` with no `logs.errors` entry.
17. `GET /assets`:
    - returns `{ data }` in creation order;
    - covers each filter and combined filters;
    - an invalid query → 400;
    - `DELETE /assets` → 405 with `Allow: GET, POST`.
18. An unknown route → 404 `NOT_FOUND`.
19. When the repository throws (inject one with `makeTestApp({ repo })`), the response is 500 `INTERNAL_ERROR` with the generic message and no stack, and there is exactly one `logs.errors` entry.
20. Every response logs exactly one `logs.responses` entry with the right status and a `path` without a query string. 4xx responses log nothing to `logs.errors`.
21. Responses have no `X-Powered-By` and include `X-Content-Type-Options: nosniff` and `Access-Control-Allow-Origin: http://localhost:5173`. A CORS preflight (`OPTIONS /assets` with `Origin` and `Access-Control-Request-Method: POST`) returns 204.
22. `Content-Type: application/json; charset=latin1` → 415, and `Content-Encoding: compress` → 415. These cover the charset and encoding branches of the error handler.
23. The error handler's remaining 4xx branch: in a test, mount the error-handling middleware from `middleware/error-handler.ts` in a small Express app of its own, behind a middleware that calls `next(err)` with an error that has `status: 400`, `expose: true` and `type: 'request.aborted'`. The response is 400 `VALIDATION_ERROR` with detail `{ field: 'body', issue: 'could not be read' }` (check it with `assertMatchesSchema('Error', body)`), and there is no `logs.errors` entry.

#### 2.4 Smoke script

Write `scripts/smoke.ts`. It must:
1. Start the server with `spawn(process.execPath, ['backend/dist/server.js'], …)` from `node:child_process`, with `PORT=3999` added to the environment and stdout and stderr inherited.
2. Wait up to 20 seconds for `GET /ping` to return 200.
3. `POST /assets` with a valid book and expect 201.
4. `GET` the returned `Location` path and expect 200 with the same body.
5. `GET /assets?q=<that title>` and expect the book in `data`.
6. Wrap steps 2–5 in `try/finally`. In `finally`, unless the child has already exited, send it `SIGTERM` and wait for its `exit` event for up to 5 seconds; if it has not exited by then, send `SIGKILL` and wait for `exit` again. A failure therefore never leaves a server on port 3999.

It exits 0 on success. On failure it throws (after the `finally` cleanup), which exits non-zero. It prints nothing of its own.

**Gate:** `npm run test:contract && npm run test:coverage -w backend && npm run smoke && npm exec --no -- tsc -p tsconfig.json && npm run typecheck -w backend && npm run lint && npm run check:rules`
Commit: `phase 2: backend`.

### Phase 3: Frontend

Work in `frontend/`. The page reaches the backend through `/api`, using the Vite dev proxy.

#### 3.1 Modules (export exactly these names)

```ts
// frontend/src/api/types.ts
export type AssetStatus = 'available' | 'on_loan' | 'lost';
export interface Asset { id: string; title: string; author: string; isbn: string | null; status: AssetStatus; createdAt: string }
export interface NewAsset { title: string; author: string; isbn?: string | null; status?: AssetStatus }
export interface AssetFilterValues { author?: string; status?: AssetStatus; q?: string }
export interface FieldIssue { field: string; issue: string }
export class ApiError extends Error {
  constructor(status: number | null, code: string, message: string, details?: FieldIssue[]);
  readonly status: number | null; readonly code: string; readonly details: FieldIssue[];
}

// frontend/src/logger.ts (the only frontend module allowed to use console)
export function logHttpResponse(entry: { method: string; url: string; status: number }): void; // console.info JSON line
export function logError(err: unknown): void;                                                  // console.error JSON line

// frontend/src/api/client.ts
export function attachLogging(instance: AxiosInstance): AxiosInstance;
export const http: AxiosInstance; // axios.create({ baseURL: import.meta.env.VITE_API_URL ?? '/api', timeout: 10000 }) + attachLogging

// frontend/src/api/assets.ts
export function listAssets(filters: AssetFilterValues): Promise<Asset[]>; // GET /assets; filters go in `params`; each filter value is trimmed, then omitted if empty
export function createAsset(input: NewAsset): Promise<Asset>;        // POST /assets; an empty isbn is omitted
// Both turn axios errors into ApiError: the HTTP status and the body's error.code/message/details,
// or status null and code 'NETWORK_ERROR' when there was no response.

// frontend/src/hooks/useDebouncedValue.ts
export function useDebouncedValue<T>(value: T, delayMs: number): T;
```

`attachLogging` adds a response interceptor:
- On success, and on errors that have a response, it calls `logHttpResponse` with the upper-cased method, `` `${config.baseURL ?? ''}${config.url ?? ''}` `` without any query string, and the status.
- On errors without a response, it calls `logError(error)`.
- It always re-throws errors.

`main.tsx` renders `<App />` into `#root` and registers `window` listeners for `error` and
`unhandledrejection` that call `logError(event.error)` and `logError(event.reason)` respectively.

#### 3.2 The page (exact user-visible text)

- `<h1>`: **Library assets**.
- **Form** (`AssetForm`, section heading `<h2>` **Register a book**):
  - Labelled inputs **Title**, **Author** and **ISBN (optional)**, and a select **Status** with options **Available** (default), **On loan** and **Lost**.
  - A submit button **Register book**, disabled while submitting. No `required` attributes and no client-side validation.
  - **On submit:** first clear any previous field errors, the general alert and **Book registered.**
  - **201:** reset **Title**, **Author** and **ISBN (optional)** to empty and **Status** to **Available**, show `role="status"` text **Book registered.**, and call `onCreated(asset)`.
  - **400:** details for `title`, `author`, `isbn` and `status` appear inline. Show the detail's `issue` text as-is (the server sends at most one issue per field, §4.7) under its input or select, in an element with id `<field>-error` (`title-error`, `author-error`, `isbn-error`, `status-error`) referenced by that control's `aria-describedby`, and set `aria-invalid="true"` on the control. If any detail has field `body` or another field, also show the general alert: `role="alert"` with **Could not register the book. Please try again.**
  - **409:** show **A book with this ISBN is already registered.** under the ISBN input, using the same mechanism (`isbn-error`).
  - **Anything else:** the general alert, `role="alert"` with **Could not register the book. Please try again.**
- **Filters** (`AssetFilters`), under `<h2>` **Books**:
  - Labelled input **Filter by author**, select **Filter by status** (options **Any status** with value `""`, then the three statuses), and input **Search titles**.
  - `App` debounces author and title search by 300 ms with `useDebouncedValue`; the status filter applies immediately.
  - The list reloads whenever the effective filters change and after `onCreated`.
- **List** (`AssetList`):
  - While loading: **Loading…**.
  - On error: `role="alert"` **Could not load books.**
  - With no results: **No books match these filters.**
  - Otherwise a table with headers **Title**, **Author**, **ISBN**, **Status** and **Added**. ISBN `null` shows **—**, status shows its label, and **Added** shows `createdAt.slice(0, 10)`.
- `styles.css` keeps the layout plain and readable.

#### 3.3 Tests

- `src/test/server.ts` exports `server` (`setupServer()` from `msw/node`) and `contractJson(method, pathTemplate, status, body)`. That function calls `assertMatchesContract` (from `../../../contract/contract-helper.js`) and then returns `HttpResponse.json(body, { status })`. Every mock response goes through it.
- `src/test/setup.ts` imports `@testing-library/jest-dom/vitest`, starts the server with `onUnhandledRequest: 'error'`, and after each test resets handlers and calls `cleanup()`.
- Each test file below contains at least these tests, with exactly these titles (`npm run check:rules` looks for each one):
- `client.test.ts`:
  - `'logs http_response without the query string'`: a 200 response logs `http_response` with a `url` that has no query string;
  - `'logs http_response for an error response and rejects'`: a 400 response logs `http_response` and rejects;
  - `'logs an error and no http_response on network failure'`: a network error (`HttpResponse.error()`) logs `error` and no `http_response`.
- `AssetForm.test.tsx`:
  - `'registers a book and omits an empty ISBN'`: the happy path posts exactly `{ title, author, status: 'available' }`, with `isbn` omitted when empty, shows **Book registered.** and calls `onCreated`;
  - `'shows server validation issues next to their fields'`: 400 details appear next to their fields with `aria-invalid`;
  - `'shows the duplicate ISBN message'`: 409 shows the ISBN message;
  - `'shows the general alert for other errors'`: 500 shows the general alert.
- `App.test.tsx`:
  - `'renders books from the API'`: rows render from `GET /assets`;
  - `'filters by author after the debounce'`: typing in **Filter by author** sends `author=` after the debounce;
  - `'filters by status immediately'`: changing **Filter by status** sends `status=`;
  - `'shows the empty state'`: the empty state appears;
  - `'shows the load error'`: the error state appears;
  - `'refreshes the list after registering a book'`: registering a book refreshes the list.
- Where tests trigger logging, spy with `const info = vi.spyOn(console, 'info').mockImplementation(() => {})` (likewise for `error`) and assert on the returned spy. Never reference `console.*` directly in tests: ESLint's `no-console` rule applies to tests too.

**Gate:** `npm run test -w frontend && npm run build -w frontend && npm run typecheck && npm run lint && npm run check:rules`
Commit: `phase 3: frontend`.

### Phase 4: Verify and report

1. Write `README.md` with these nine sections, each a `## ` heading with exactly this text:
   - `## Overview`
   - `## Requirements`
   - `## Quick start` (`npm ci --ignore-scripts`, `npm run dev -w backend`, `npm run dev -w frontend`, then open http://localhost:5173)
   - `## Configuration` (the table in §4.4)
   - `## API` (one line per endpoint; point to `contract/openapi.yaml`)
   - `## Testing` (`npm run verify`)
   - `## Observability` (the two log events)
   - `## Decisions` (point to §4 of `instructions.md`)
   - `## Not included` (the table in §4.6)
2. Run `npm run verify` and fix anything it reports.
3. Run `npm audit --audit-level=high` and record its summary in `BUILD_REPORT.md` under "npm audit". A high or critical advisory does not fail the build (you may not change versions); list each one under "Deviations from instructions" with the package and advisory id.
4. Fill in `BUILD_REPORT.md` from Appendix B. Every phase gets **PASS** or **FAIL**, with the number of attempts. Phase 4's result is that of the gate below; record **PASS** when `npm run verify` passed in step 2, and correct it if the gate then fails.
5. Run the gate last. If it fails, fix the cause, update `BUILD_REPORT.md` (each gate run counts as an attempt) and run it again.

**Gate:** `npm run verify && node scripts/check-rules.mjs --report`
Commit: `phase 4: verify and report`.

## Appendix A: `contract/openapi.yaml`

SHA-256: `{{CONTRACT_SHA256}}`

{{CONTRACT}}

## Appendix B: `BUILD_REPORT.md` template

Copy this into `BUILD_REPORT.md` and fill in every field.

```markdown
# Build report

- Date (UTC):
- Agent and model:
- Node / npm versions:

## Phase results

| Phase | Gate | Result (PASS / FAIL) | Attempts | Notes |
|---|---|---|---|---|
| 0 Preflight | Node version check | | | |
| 1 Scaffold | contract hash, contract:validate, tsc, lint, check:rules | | | |
| 2 Backend | test:contract, test:coverage, smoke, tsc, typecheck, lint, check:rules | | | |
| 3 Frontend | frontend test, build, typecheck, lint, check:rules | | | |
| 4 Verify | npm run verify, check-rules --report | | | |

## Backend coverage

Lines / branches / functions / statements:

## Deviations from instructions

None, or one entry per deviation: what, why, and the evidence.

## Unspecified decisions

Every choice this file did not pin, one line each.

## npm audit

Summary of `npm audit --audit-level=high` output.
```

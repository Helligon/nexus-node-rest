# Shelfwright Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Shelfwright, a portable `instructions.md` that any coding agent can follow to build the Library Asset Service, and a separate evaluator that assesses each Shelfwright run with hidden checks and a different agent. The examiner (the user) gives the final verdict.

**Architecture:** Two top-level folders.
- `shelfwright/` holds the agent: an instructions template plus the one verbatim file (`openapi.yaml`). They are assembled into the root `instructions.md`, which never mentions evaluation.
- `evaluator/` sits above agent and app, and nothing from it reaches a build. It holds:
  - the hidden acceptance suite and an independent golden server, which proves the suite and provides the behaviour baseline;
  - deterministic checks;
  - a scorer-agent prompt;
  - an LLM judge;
  - round reports;
  - Docker images that sandbox the builder and the scorer.

**Tech Stack:** Node 24, TypeScript 5.9, Vitest 4, tsx, Ajv 8 (JSON Schema 2020-12), yaml, swagger-parser, Docker, Claude Code CLI (headless) for builder and scorer agents.

**Spec:** `docs/superpowers/specs/2026-10-15-shelfwright-design.md` (v2).

## Global Constraints

- Node 24.x. Every `npm install` / `npm ci` uses `--ignore-scripts`.
- Exact dependency versions only, each published before 2026-10-01. The app's pinned set (the dependency table in `instructions.md`):
  - root devDependencies: `@apidevtools/swagger-parser@12.1.0`, `@eslint/js@10.0.1`, `@types/node@24.19.0`, `@vitest/coverage-v8@4.1.11`, `ajv@8.20.0`, `ajv-formats@3.0.1`, `eslint@10.11.0`, `globals@16.5.0`, `tsx@4.23.15`, `typescript@5.9.3`, `typescript-eslint@8.71.0`, `vitest@4.1.11`, `yaml@2.9.1`
  - backend dependencies: `cors@2.8.6`, `express@5.2.1`, `helmet@8.3.0`, `zod@4.6.5`; devDependencies: `@types/cors@2.8.19`, `@types/express@5.0.6`, `@types/supertest@7.2.1`, `supertest@7.3.0`
  - frontend dependencies: `axios@1.20.0`, `react@19.3.0`, `react-dom@19.3.0`; devDependencies: `@testing-library/dom@10.4.2`, `@testing-library/jest-dom@6.9.1`, `@testing-library/react@16.3.3`, `@testing-library/user-event@14.6.7`, `@types/react@19.3.0`, `@types/react-dom@19.3.0`, `@vitejs/plugin-react@5.2.0`, `jsdom@27.4.0`, `msw@2.15.0`, `vite@7.3.6`
  - eval images: `node:24-bookworm-slim`, `@anthropic-ai/claude-code@2.1.286`
- `instructions.md` must not contain evaluation vocabulary (evaluator, scorer, judge, oracle, golden, harness, examiner, grader…). A test enforces this.
- `instructions.md` must not assume any particular agent tool.
- The evaluator must not hold hidden requirements. Every check traces to a sentence in `instructions.md`.
- App log events: only `http_response` and `error` JSON lines (spec §5 C3).
- Builder model default `claude-sonnet-5-5`, scorer model default `claude-opus-5-5`. They must be separate sessions; different models are preferred.

## Review Focus

1. **Contract hash drift.** Editing `openapi.yaml` without re-assembling must fail the shelfwright tests, and the hash in `instructions.md` must equal the hash the Phase 1 gate computes. Pinned by the "committed up to date" and hash tests in Task 6.
2. **Acceptance suite reruns against a long-lived server.** The suite must pass twice against one server (no ISBN collisions or order assumptions). Pinned by Task 5's double run.
3. **A run that games its own checks.** A run with a skipped test, an `eslint-disable`, a loosened version range, an extra script, a coverage exclusion or a narrowed coverage `include` must fail `checks.json` even if its own `npm run verify` passes. Pinned by the tests in Tasks 7 and 9.
4. **Examiner notes are never overwritten.** Regenerating a review must not destroy a filled-in `review.md`. Pinned in Task 11.
5. **Scorer independence.** The scorer agent must not see the builder transcript and must not be able to modify the build. Pinned by Task 10 Step 6 (mount check: `/work` read-only, transcript not mounted).

---

## File Structure

```
.gitignore
instructions.md                              GENERATED (Task 6)
shelfwright/
  package.json package-lock.json tsconfig.json vitest.config.ts
  contract/openapi.yaml                      the only verbatim content
  instructions.template.md                   prose of Shelfwright
  src/assemble.ts  scripts/assemble.ts
  test/contract.test.ts  test/assemble.test.ts
evaluator/
  package.json package-lock.json tsconfig.json vitest.config.ts README.md CHANGELOG.md
  oracle/contract.ts                         evaluator's own contract validator
  oracle/acceptance/*.ts                     hidden black-box acceptance suite
  oracle/golden-server.ts  oracle/golden-probe.json
  checks/files.ts  checks/manifest-check.ts  checks/source-scan.ts  checks/coverage-check.ts
  checks/contract-check.ts  checks/log-check.ts  checks/probe.ts  checks/diff.ts
  checks/gates.ts  checks/server-process.ts  checks/run-checks.ts
  scorer/scorer-prompt.md
  judge/judge-prompt.md  judge/judge.sh
  report/diff-runs.ts  report/review.ts
  scripts/preflight.ts  scripts/golden-probe.ts
  docker/builder.Dockerfile  docker/scorer.Dockerfile  docker/scorer.Dockerfile.dockerignore
  build-images.sh  run.sh  score-run.sh
  test/*.test.ts
  rounds/                                    evidence (run repos git-ignored)
```

---

### Task 1: Scaffold both packages

**Files:**
- Create: `.gitignore`, `shelfwright/package.json`, `shelfwright/tsconfig.json`, `shelfwright/vitest.config.ts`, `evaluator/package.json`, `evaluator/tsconfig.json`, `evaluator/vitest.config.ts`, `shelfwright/test/smoke.test.ts`, `evaluator/test/smoke.test.ts`

**Interfaces:**
- Produces: `npm test` and `npm run typecheck` in both `shelfwright/` and `evaluator/`.

- [ ] **Step 1: `.gitignore`**

```gitignore
node_modules/
.DS_Store
evaluator/rounds/*/run-*/repo/
```

- [ ] **Step 2: `shelfwright/package.json`**

```json
{
  "name": "shelfwright",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24 <25" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json",
    "assemble": "tsx scripts/assemble.ts",
    "check": "tsx scripts/assemble.ts --check"
  },
  "devDependencies": {
    "@apidevtools/swagger-parser": "12.1.0",
    "@types/node": "24.19.0",
    "tsx": "4.23.15",
    "typescript": "5.9.3",
    "vitest": "4.1.11"
  }
}
```

- [ ] **Step 3: `evaluator/package.json`**

```json
{
  "name": "shelfwright-evaluator",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24 <25" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json",
    "golden": "tsx oracle/golden-server.ts",
    "golden:probe": "tsx scripts/golden-probe.ts",
    "preflight": "tsx scripts/preflight.ts"
  },
  "devDependencies": {
    "@types/node": "24.19.0",
    "ajv": "8.20.0",
    "ajv-formats": "3.0.1",
    "tsx": "4.23.15",
    "typescript": "5.9.3",
    "vitest": "4.1.11",
    "yaml": "2.9.1"
  }
}
```

- [ ] **Step 4: Both `tsconfig.json` files**

`shelfwright/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "scripts", "test", "vitest.config.ts"]
}
```

`evaluator/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["oracle", "checks", "report", "scripts", "test", "vitest.config.ts"]
}
```

- [ ] **Step 5: Both `vitest.config.ts` files** (identical content in `shelfwright/` and `evaluator/`)

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 120000,
  },
});
```

- [ ] **Step 6: Smoke tests** (identical content in `shelfwright/test/smoke.test.ts` and `evaluator/test/smoke.test.ts`)

```ts
import { describe, expect, it } from 'vitest';

describe('toolchain', () => {
  it('runs on Node 24', () => {
    expect(process.versions.node.startsWith('24.')).toBe(true);
  });
});
```

- [ ] **Step 7: Install and run**

Run: `(cd shelfwright && npm install --ignore-scripts && npm test && npm run typecheck) && (cd evaluator && npm install --ignore-scripts && npm test && npm run typecheck)`
Expected: both pass; both lockfiles created.

- [ ] **Step 8: Commit**

```bash
git add .gitignore shelfwright evaluator
git commit -m "chore: scaffold shelfwright and evaluator packages"
```

---

### Task 2: The API contract (Shelfwright's only verbatim file)

**Files:**
- Create: `shelfwright/contract/openapi.yaml`
- Test: `shelfwright/test/contract.test.ts`

**Interfaces:**
- Produces: `shelfwright/contract/openapi.yaml`, read by the assembler (Task 6) and by the evaluator's contract validator (Task 3) via the relative path `../../shelfwright/contract/openapi.yaml` from `evaluator/oracle/`.

- [ ] **Step 1: Write the failing test `shelfwright/test/contract.test.ts`**

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';
import { describe, expect, it } from 'vitest';

const CONTRACT = fileURLToPath(new URL('../contract/openapi.yaml', import.meta.url));

describe('contract/openapi.yaml', () => {
  it('is a valid OpenAPI 3.1 document', async () => {
    await expect(SwaggerParser.validate(CONTRACT)).resolves.toBeTruthy();
  });

  it('defines exactly the required operations', async () => {
    const api = (await SwaggerParser.parse(CONTRACT)) as { paths: Record<string, Record<string, unknown>> };
    const operations = Object.entries(api.paths).flatMap(([path, item]) => Object.keys(item).map((method) => `${method.toUpperCase()} ${path}`));
    expect(operations.sort()).toEqual(['GET /assets', 'GET /assets/{id}', 'GET /ping', 'POST /assets']);
  });

  it('ends with a newline and contains no four-backtick fence', () => {
    const text = readFileSync(CONTRACT, 'utf8');
    expect(text.endsWith('\n')).toBe(true);
    expect(text.includes('````')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd shelfwright && npx vitest run test/contract.test.ts`
Expected: FAIL with ENOENT for `contract/openapi.yaml`.

- [ ] **Step 3: Write `shelfwright/contract/openapi.yaml`**

```yaml
openapi: 3.1.0
info:
  title: Library Asset Service
  version: 1.0.0
  description: Register books (assets) in a library and list them with filters.
paths:
  /ping:
    get:
      operationId: ping
      summary: Liveness check
      responses:
        '200':
          description: The service is running.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Ping'
  /assets:
    post:
      operationId: createAsset
      summary: Register an asset
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/NewAsset'
      responses:
        '201':
          description: The asset was created.
          headers:
            Location:
              description: Path of the new asset, relative to the API root.
              required: true
              schema:
                type: string
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Asset'
        '400':
          $ref: '#/components/responses/ValidationError'
        '409':
          $ref: '#/components/responses/Conflict'
        '413':
          $ref: '#/components/responses/PayloadTooLarge'
        '415':
          $ref: '#/components/responses/UnsupportedMediaType'
        '500':
          $ref: '#/components/responses/InternalError'
    get:
      operationId: listAssets
      summary: List assets, optionally filtered
      description: >-
        Filters combine with AND. All filter values are trimmed. Unknown, repeated
        or empty parameters are rejected with 400. Results are in creation order.
      parameters:
        - name: author
          in: query
          description: Case-insensitive exact match on author.
          schema:
            type: string
            minLength: 1
            maxLength: 100
        - name: status
          in: query
          schema:
            $ref: '#/components/schemas/Status'
        - name: q
          in: query
          description: Case-insensitive substring match on title.
          schema:
            type: string
            minLength: 1
            maxLength: 200
      responses:
        '200':
          description: Matching assets.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AssetList'
        '400':
          $ref: '#/components/responses/ValidationError'
        '500':
          $ref: '#/components/responses/InternalError'
  /assets/{id}:
    get:
      operationId: getAsset
      summary: Fetch one asset
      parameters:
        - name: id
          in: path
          required: true
          description: Asset id. Any value that is not an existing id returns 404.
          schema:
            type: string
      responses:
        '200':
          description: The asset.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Asset'
        '404':
          $ref: '#/components/responses/NotFound'
        '500':
          $ref: '#/components/responses/InternalError'
components:
  schemas:
    Ping:
      type: object
      additionalProperties: false
      required: [status]
      properties:
        status:
          const: ok
    Status:
      type: string
      enum: [available, on_loan, lost]
    NewAsset:
      type: object
      additionalProperties: false
      required: [title, author]
      properties:
        title:
          type: string
          description: Trimmed, then 1-200 characters.
        author:
          type: string
          description: Trimmed, then 1-100 characters.
        isbn:
          type: [string, 'null']
          description: >-
            ISBN-10 or ISBN-13. Spaces and hyphens are removed and a lower-case x is
            upper-cased before the checksum is validated. Null or omitted means no ISBN.
        status:
          $ref: '#/components/schemas/Status'
    Asset:
      type: object
      additionalProperties: false
      required: [id, title, author, isbn, status, createdAt]
      properties:
        id:
          type: string
          format: uuid
        title:
          type: string
          minLength: 1
          maxLength: 200
        author:
          type: string
          minLength: 1
          maxLength: 100
        isbn:
          type: [string, 'null']
          pattern: '^(\d{9}[\dX]|\d{13})$'
        status:
          $ref: '#/components/schemas/Status'
        createdAt:
          type: string
          format: date-time
    AssetList:
      type: object
      additionalProperties: false
      required: [data]
      properties:
        data:
          type: array
          items:
            $ref: '#/components/schemas/Asset'
    ErrorCode:
      type: string
      enum:
        - VALIDATION_ERROR
        - NOT_FOUND
        - METHOD_NOT_ALLOWED
        - CONFLICT
        - PAYLOAD_TOO_LARGE
        - UNSUPPORTED_MEDIA_TYPE
        - INTERNAL_ERROR
    ErrorDetail:
      type: object
      additionalProperties: false
      required: [field, issue]
      properties:
        field:
          type: string
          minLength: 1
        issue:
          type: string
          minLength: 1
    Error:
      type: object
      additionalProperties: false
      required: [error]
      properties:
        error:
          type: object
          additionalProperties: false
          required: [code, message]
          properties:
            code:
              $ref: '#/components/schemas/ErrorCode'
            message:
              type: string
              minLength: 1
            details:
              type: array
              minItems: 1
              items:
                $ref: '#/components/schemas/ErrorDetail'
          if:
            properties:
              code:
                const: VALIDATION_ERROR
          then:
            required: [details]
          else:
            not:
              required: [details]
  responses:
    ValidationError:
      description: The request was invalid. `details` names each offending field or parameter.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
    NotFound:
      description: No such resource.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
    Conflict:
      description: An asset with this ISBN already exists.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
    PayloadTooLarge:
      description: The request body is larger than 10 kb.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
    UnsupportedMediaType:
      description: The request body is not application/json.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
    InternalError:
      description: Unexpected failure. The message is always generic.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
```

- [ ] **Step 4: Run the test**

Run: `cd shelfwright && npx vitest run test/contract.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shelfwright
git commit -m "feat(shelfwright): API contract"
```

---

### Task 3: Evaluator contract validator

**Files:**
- Create: `evaluator/oracle/contract.ts`
- Test: `evaluator/test/contract.test.ts`

**Interfaces:**
- Consumes: `shelfwright/contract/openapi.yaml`.
- Produces: `assertMatchesContract(method: string, pathTemplate: string, status: number, body: unknown): void` and `assertMatchesSchema(schemaName: string, body: unknown): void`. Both throw an `Error` whose message contains `does not match the contract`, `Contract has no operation`, `Contract has no <status> response` or `Contract has no schema`.

- [ ] **Step 1: Write the failing test `evaluator/test/contract.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { assertMatchesContract, assertMatchesSchema } from '../oracle/contract.js';

const asset = {
  id: '3f1c2a4e-8b7d-4c1a-9e2f-5a6b7c8d9e0f',
  title: 'Dune',
  author: 'Frank Herbert',
  isbn: '9780441013593',
  status: 'available',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('assertMatchesContract', () => {
  it('accepts a valid 201 asset', () => {
    expect(() => assertMatchesContract('POST', '/assets', 201, asset)).not.toThrow();
  });

  it('accepts a null ISBN via the {id} path template', () => {
    expect(() => assertMatchesContract('GET', '/assets/{id}', 200, { ...asset, isbn: null })).not.toThrow();
  });

  it('rejects an extra property', () => {
    expect(() => assertMatchesContract('POST', '/assets', 201, { ...asset, extra: 1 })).toThrow(/does not match the contract/);
  });

  it('rejects an un-normalised ISBN', () => {
    expect(() => assertMatchesContract('POST', '/assets', 201, { ...asset, isbn: '978-0441013593' })).toThrow();
  });

  it('accepts a list response', () => {
    expect(() => assertMatchesContract('GET', '/assets', 200, { data: [asset] })).not.toThrow();
  });

  it('requires details on VALIDATION_ERROR and forbids them elsewhere', () => {
    const detail = [{ field: 'title', issue: 'required' }];
    expect(() => assertMatchesContract('POST', '/assets', 400, { error: { code: 'VALIDATION_ERROR', message: 'x', details: detail } })).not.toThrow();
    expect(() => assertMatchesContract('POST', '/assets', 400, { error: { code: 'VALIDATION_ERROR', message: 'x' } })).toThrow();
    expect(() => assertMatchesContract('POST', '/assets', 409, { error: { code: 'CONFLICT', message: 'x', details: detail } })).toThrow();
  });

  it('resolves shared response components', () => {
    expect(() => assertMatchesContract('GET', '/assets/{id}', 404, { error: { code: 'NOT_FOUND', message: 'nope' } })).not.toThrow();
  });

  it('throws for undefined operations and statuses', () => {
    expect(() => assertMatchesContract('DELETE', '/assets', 200, {})).toThrow(/no operation DELETE \/assets/);
    expect(() => assertMatchesContract('GET', '/ping', 418, {})).toThrow(/no 418 response/);
  });
});

describe('assertMatchesSchema', () => {
  it('validates named schemas', () => {
    expect(() => assertMatchesSchema('Error', { error: { code: 'METHOD_NOT_ALLOWED', message: 'no' } })).not.toThrow();
    expect(() => assertMatchesSchema('Error', { error: { code: 'TEAPOT', message: 'no' } })).toThrow();
    expect(() => assertMatchesSchema('Nope', {})).toThrow(/no schema Nope/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd evaluator && npx vitest run test/contract.test.ts`
Expected: FAIL, cannot resolve `../oracle/contract.js`.

- [ ] **Step 3: Write `evaluator/oracle/contract.ts`**

```ts
// The evaluator's own contract validator. Independent of anything a build contains.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { ValidateFunction } from 'ajv';
import { parse } from 'yaml';

const SPEC_ID = 'openapi.json';
export const CONTRACT_PATH = fileURLToPath(new URL('../../shelfwright/contract/openapi.yaml', import.meta.url));
const spec: unknown = parse(readFileSync(CONTRACT_PATH, 'utf8'));

const ajv = new Ajv2020({ allErrors: true, strict: false, validateSchema: false });
addFormats(ajv);
ajv.addSchema(spec as object, SPEC_ID);

const validators = new Map<string, ValidateFunction>();

function lookup(keys: string[]): unknown {
  let node: unknown = spec;
  for (const key of keys) {
    if (node === null || typeof node !== 'object' || !(key in node)) return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

function refToKeys(ref: string): string[] {
  if (!ref.startsWith('#/')) throw new Error(`Unsupported $ref ${ref}`);
  return ref.slice(2).split('/').map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function toFragment(keys: string[]): string {
  return `#/${keys.map((key) => encodeURIComponent(key.replace(/~/g, '~0').replace(/\//g, '~1'))).join('/')}`;
}

function check(keys: string[], body: unknown, label: string): void {
  const fragment = toFragment(keys);
  let validate = validators.get(fragment);
  if (!validate) {
    validate = ajv.compile({ $ref: `${SPEC_ID}${fragment}` });
    validators.set(fragment, validate);
  }
  if (!validate(body)) {
    throw new Error(`${label} does not match the contract: ${ajv.errorsText(validate.errors)}\nBody: ${JSON.stringify(body)}`);
  }
}

export function assertMatchesContract(method: string, pathTemplate: string, status: number, body: unknown): void {
  const label = `${method.toUpperCase()} ${pathTemplate}`;
  const operation = ['paths', pathTemplate, method.toLowerCase()];
  if (lookup(operation) === undefined) throw new Error(`Contract has no operation ${label}`);
  let response = [...operation, 'responses', String(status)];
  const node = lookup(response);
  if (node === undefined) throw new Error(`Contract has no ${status} response for ${label}`);
  const ref = (node as { $ref?: unknown }).$ref;
  if (typeof ref === 'string') response = refToKeys(ref);
  const schema = [...response, 'content', 'application/json', 'schema'];
  if (lookup(schema) === undefined) throw new Error(`Contract has no JSON body for ${status} on ${label}`);
  check(schema, body, `${label} -> ${status}`);
}

export function assertMatchesSchema(schemaName: string, body: unknown): void {
  const keys = ['components', 'schemas', schemaName];
  if (lookup(keys) === undefined) throw new Error(`Contract has no schema ${schemaName}`);
  check(keys, body, `Schema ${schemaName}`);
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd evaluator && npx vitest run test/contract.test.ts && npm run typecheck`
Expected: PASS; exit 0. If the `{id}` case fails with "can't resolve reference", fix `toFragment`, not the test.

- [ ] **Step 5: Commit**

```bash
git add evaluator
git commit -m "feat(evaluator): independent contract validator"
```

---

### Task 4: Hidden acceptance suite

**Files:**
- Create (all in `evaluator/oracle/acceptance/`): `vitest.config.ts`, `helpers.ts`, `ping.test.ts`, `create-asset.test.ts`, `get-asset.test.ts`, `list-assets.test.ts`, `errors.test.ts`
- Test: `evaluator/test/acceptance-helpers.test.ts`

**Interfaces:**
- Consumes: Task 3 validator.
- Produces: a suite run with `npx vitest run --config oracle/acceptance/vitest.config.ts` from `evaluator/`, against `BASE_URL` (default `http://127.0.0.1:3000`). Every assertion traces to `instructions.md` §4 or the contract.

- [ ] **Step 1: Write the failing helper test `evaluator/test/acceptance-helpers.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  isbn10CheckDigit,
  isbn13CheckDigit,
  query,
  randomIsbn10EndingInX,
  randomIsbn13,
  unique,
} from '../oracle/acceptance/helpers.js';

describe('acceptance helpers', () => {
  it('computes ISBN-13 check digits', () => {
    expect(isbn13CheckDigit('978030640615')).toBe('7');
    expect(isbn13CheckDigit('978044101359')).toBe('3');
  });

  it('computes ISBN-10 check digits including X', () => {
    expect(isbn10CheckDigit('030640615')).toBe('2');
    expect(isbn10CheckDigit('080442957')).toBe('X');
  });

  it('generates valid random ISBNs', () => {
    for (let i = 0; i < 20; i++) {
      const isbn13 = randomIsbn13();
      expect(isbn13).toMatch(/^978\d{10}$/);
      expect(isbn13CheckDigit(isbn13.slice(0, 12))).toBe(isbn13.slice(12));
      expect(randomIsbn10EndingInX()).toMatch(/^\d{9}X$/);
    }
  });

  it('makes unique labels and query strings', () => {
    expect(unique('Title')).not.toBe(unique('Title'));
    expect(query({ author: 'A B', status: 'lost' })).toBe('?author=A+B&status=lost');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd evaluator && npx vitest run test/acceptance-helpers.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: `evaluator/oracle/acceptance/vitest.config.ts`**

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Black-box suite. Runs over HTTP against BASE_URL; never imports a build's code.
export default defineConfig({
  test: {
    root: fileURLToPath(new URL('.', import.meta.url)),
    include: ['**/*.test.ts'],
    testTimeout: 15000,
    fileParallelism: false,
  },
});
```

- [ ] **Step 4: `evaluator/oracle/acceptance/helpers.ts`**

```ts
import { expect } from 'vitest';
import { assertMatchesContract, assertMatchesSchema } from '../contract.js';

export { assertMatchesContract, assertMatchesSchema };

export const BASE_URL = (process.env.BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- bodies are checked against the contract at runtime
export type Json = any;

export interface ApiResponse {
  status: number;
  headers: Headers;
  body: Json;
}

export interface RequestOptions {
  json?: unknown;
  rawBody?: string;
  contentType?: string;
}

export async function api(method: string, path: string, options: RequestOptions = {}): Promise<ApiResponse> {
  const headers: Record<string, string> = {};
  let body: string | undefined;
  if (options.json !== undefined) {
    body = JSON.stringify(options.json);
    headers['content-type'] = 'application/json';
  }
  if (options.rawBody !== undefined) body = options.rawBody;
  if (options.contentType !== undefined) headers['content-type'] = options.contentType;
  const res = await fetch(`${BASE_URL}${path}`, { method, headers, body });
  const text = await res.text();
  let parsed: Json = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return { status: res.status, headers: res.headers, body: parsed };
}

export function query(params: Record<string, string>): string {
  return `?${new URLSearchParams(params).toString()}`;
}

export function unique(label: string): string {
  return `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function isbn13CheckDigit(first12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

export function isbn10CheckDigit(first9: string): string {
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (i + 1) * Number(first9[i]);
  const check = sum % 11;
  return check === 10 ? 'X' : String(check);
}

function randomDigits(count: number): string {
  let digits = '';
  for (let i = 0; i < count; i++) digits += String(Math.floor(Math.random() * 10));
  return digits;
}

export function randomIsbn13(): string {
  const first12 = `978${randomDigits(9)}`;
  return first12 + isbn13CheckDigit(first12);
}

export function randomIsbn10EndingInX(): string {
  for (;;) {
    const first9 = randomDigits(9);
    if (isbn10CheckDigit(first9) === 'X') return `${first9}X`;
  }
}

export async function createAsset(fields: Record<string, unknown>): Promise<Json> {
  const res = await api('POST', '/assets', { json: fields });
  if (res.status !== 201) throw new Error(`setup: expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
}

export function expectError(res: ApiResponse, status: number, code: string): void {
  expect(res.status).toBe(status);
  expect(res.headers.get('content-type') ?? '').toMatch(/^application\/json/);
  assertMatchesSchema('Error', res.body);
  expect(res.body.error.code).toBe(code);
  expect(JSON.stringify(res.body)).not.toMatch(/\bat .+:\d+:\d+/);
}

export function expectDetailFor(res: ApiResponse, field: string): void {
  const fields = (res.body.error.details ?? []).map((detail: { field: string }) => detail.field);
  expect(fields).toContain(field);
}
```

- [ ] **Step 5: `evaluator/oracle/acceptance/ping.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { api, assertMatchesContract } from './helpers.js';

describe('GET /ping', () => {
  it('returns 200 {"status":"ok"} as JSON', async () => {
    const res = await api('GET', '/ping');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toMatch(/^application\/json/);
    expect(res.body).toEqual({ status: 'ok' });
    assertMatchesContract('GET', '/ping', 200, res.body);
  });
});
```

- [ ] **Step 6: `evaluator/oracle/acceptance/create-asset.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  api,
  assertMatchesContract,
  createAsset,
  expectDetailFor,
  expectError,
  randomIsbn10EndingInX,
  randomIsbn13,
  unique,
} from './helpers.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('POST /assets: success', () => {
  it('creates an asset from the required fields and applies defaults', async () => {
    const title = unique('Title');
    const author = unique('Author');
    const res = await api('POST', '/assets', { json: { title, author } });
    expect(res.status).toBe(201);
    assertMatchesContract('POST', '/assets', 201, res.body);
    expect(res.body).toMatchObject({ title, author, isbn: null, status: 'available' });
    expect(res.body.id).toMatch(UUID_V4);
    expect(Number.isNaN(Date.parse(res.body.createdAt))).toBe(false);
    expect(res.headers.get('location')).toBe(`/assets/${res.body.id}`);
  });

  it('trims title and author', async () => {
    const title = unique('Title');
    const author = unique('Author');
    const res = await api('POST', '/assets', { json: { title: `  ${title}  `, author: `\t${author}\n` } });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe(title);
    expect(res.body.author).toBe(author);
  });

  it('accepts every field and normalises a hyphenated ISBN-13', async () => {
    const isbn = randomIsbn13();
    const formatted = `${isbn.slice(0, 3)}-${isbn.slice(3, 4)} ${isbn.slice(4, 8)}-${isbn.slice(8, 12)}-${isbn.slice(12)}`;
    const res = await api('POST', '/assets', {
      json: { title: unique('Title'), author: unique('Author'), isbn: formatted, status: 'on_loan' },
    });
    expect(res.status).toBe(201);
    assertMatchesContract('POST', '/assets', 201, res.body);
    expect(res.body.isbn).toBe(isbn);
    expect(res.body.status).toBe('on_loan');
  });

  it('accepts an ISBN-10 ending in a lower-case x and stores it upper-case', async () => {
    const isbn = randomIsbn10EndingInX();
    const res = await api('POST', '/assets', {
      json: { title: unique('Title'), author: unique('Author'), isbn: isbn.toLowerCase() },
    });
    expect(res.status).toBe(201);
    expect(res.body.isbn).toBe(isbn);
  });

  it('accepts an explicit null ISBN', async () => {
    const res = await api('POST', '/assets', { json: { title: unique('Title'), author: unique('Author'), isbn: null } });
    expect(res.status).toBe(201);
    expect(res.body.isbn).toBeNull();
  });

  it('accepts a 200-character title and a 100-character author', async () => {
    const res = await api('POST', '/assets', { json: { title: 'a'.repeat(200), author: 'b'.repeat(100) } });
    expect(res.status).toBe(201);
    assertMatchesContract('POST', '/assets', 201, res.body);
  });
});

describe('POST /assets: validation', () => {
  const cases: Array<[string, unknown, string]> = [
    ['a missing title', { author: 'A' }, 'title'],
    ['a blank title', { title: '   ', author: 'A' }, 'title'],
    ['a title over 200 characters', { title: 'a'.repeat(201), author: 'A' }, 'title'],
    ['a non-string title', { title: 42, author: 'A' }, 'title'],
    ['a missing author', { title: 'T' }, 'author'],
    ['a blank author', { title: 'T', author: '  ' }, 'author'],
    ['an author over 100 characters', { title: 'T', author: 'b'.repeat(101) }, 'author'],
    ['an ISBN with a bad checksum', { title: 'T', author: 'A', isbn: '9780306406158' }, 'isbn'],
    ['an ISBN with the wrong length', { title: 'T', author: 'A', isbn: '12345' }, 'isbn'],
    ['an empty-string ISBN', { title: 'T', author: 'A', isbn: '' }, 'isbn'],
    ['a non-string ISBN', { title: 'T', author: 'A', isbn: 9780306406157 }, 'isbn'],
    ['an unknown status', { title: 'T', author: 'A', status: 'borrowed' }, 'status'],
    ['an unknown field', { title: 'T', author: 'A', colour: 'red' }, 'colour'],
    ['a JSON array body', [], 'body'],
  ];

  it.each(cases)('rejects %s with 400', async (_name, body, field) => {
    const res = await api('POST', '/assets', { json: body });
    expectError(res, 400, 'VALIDATION_ERROR');
    assertMatchesContract('POST', '/assets', 400, res.body);
    expectDetailFor(res, field);
  });

  it('rejects malformed JSON with 400 on field "body"', async () => {
    const res = await api('POST', '/assets', { rawBody: '{"title": "Dune",', contentType: 'application/json' });
    expectError(res, 400, 'VALIDATION_ERROR');
    expectDetailFor(res, 'body');
  });

  it('treats an empty JSON body as {} and reports both required fields', async () => {
    const res = await api('POST', '/assets', { rawBody: '', contentType: 'application/json' });
    expectError(res, 400, 'VALIDATION_ERROR');
    expectDetailFor(res, 'title');
    expectDetailFor(res, 'author');
  });
});

describe('POST /assets: content type and size', () => {
  it('rejects a non-JSON content type with 415', async () => {
    const res = await api('POST', '/assets', { rawBody: 'title=Dune', contentType: 'text/plain' });
    expectError(res, 415, 'UNSUPPORTED_MEDIA_TYPE');
    assertMatchesContract('POST', '/assets', 415, res.body);
  });

  it('rejects a body over 10 kb with 413', async () => {
    const res = await api('POST', '/assets', { json: { title: 'a'.repeat(11000), author: 'A' } });
    expectError(res, 413, 'PAYLOAD_TOO_LARGE');
    assertMatchesContract('POST', '/assets', 413, res.body);
  });
});

describe('POST /assets: duplicates', () => {
  it('rejects a second asset with the same ISBN with 409', async () => {
    const isbn = randomIsbn13();
    await createAsset({ title: unique('Title'), author: unique('Author'), isbn });
    const res = await api('POST', '/assets', { json: { title: unique('Title'), author: unique('Author'), isbn } });
    expectError(res, 409, 'CONFLICT');
    assertMatchesContract('POST', '/assets', 409, res.body);
  });

  it('treats differently formatted copies of the same ISBN as duplicates', async () => {
    const isbn = randomIsbn13();
    await createAsset({ title: unique('Title'), author: unique('Author'), isbn });
    const res = await api('POST', '/assets', {
      json: { title: unique('Title'), author: unique('Author'), isbn: `${isbn.slice(0, 3)}-${isbn.slice(3)}` },
    });
    expectError(res, 409, 'CONFLICT');
  });

  it('allows two assets with the same title and author when neither has an ISBN', async () => {
    const fields = { title: unique('Title'), author: unique('Author') };
    const first = await createAsset(fields);
    const second = await createAsset(fields);
    expect(second.id).not.toBe(first.id);
  });
});
```

- [ ] **Step 7: `evaluator/oracle/acceptance/get-asset.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { api, assertMatchesContract, createAsset, expectError, unique } from './helpers.js';

describe('GET /assets/{id}', () => {
  it('returns a created asset', async () => {
    const created = await createAsset({ title: unique('Title'), author: unique('Author') });
    const res = await api('GET', `/assets/${created.id}`);
    expect(res.status).toBe(200);
    assertMatchesContract('GET', '/assets/{id}', 200, res.body);
    expect(res.body).toEqual(created);
  });

  it('serves the path given in the Location header', async () => {
    const post = await api('POST', '/assets', { json: { title: unique('Title'), author: unique('Author') } });
    const location = post.headers.get('location');
    expect(location).toBe(`/assets/${post.body.id}`);
    const res = await api('GET', location ?? '');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(post.body);
  });

  it('returns 404 for an unknown UUID', async () => {
    const res = await api('GET', '/assets/00000000-0000-4000-8000-000000000000');
    expectError(res, 404, 'NOT_FOUND');
    assertMatchesContract('GET', '/assets/{id}', 404, res.body);
  });

  it('returns 404 for an id that is not a UUID', async () => {
    const res = await api('GET', '/assets/not-a-uuid');
    expectError(res, 404, 'NOT_FOUND');
  });
});
```

- [ ] **Step 8: `evaluator/oracle/acceptance/list-assets.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { api, assertMatchesContract, createAsset, expectDetailFor, expectError, query, unique } from './helpers.js';

async function list(params: Record<string, string>) {
  const res = await api('GET', `/assets${query(params)}`);
  expect(res.status).toBe(200);
  assertMatchesContract('GET', '/assets', 200, res.body);
  return res.body.data as Array<Record<string, unknown>>;
}

describe('GET /assets', () => {
  it('returns a data array containing created assets', async () => {
    const created = await createAsset({ title: unique('Title'), author: unique('Author') });
    const res = await api('GET', '/assets');
    expect(res.status).toBe(200);
    assertMatchesContract('GET', '/assets', 200, res.body);
    expect(res.body.data).toContainEqual(created);
  });

  it('lists assets in creation order', async () => {
    const author = unique('Author');
    for (const title of ['First', 'Second', 'Third']) await createAsset({ title, author });
    const data = await list({ author });
    expect(data.map((asset) => asset.title)).toEqual(['First', 'Second', 'Third']);
  });

  it('filters by author: exact match, case-insensitive', async () => {
    const author = unique('Author');
    await createAsset({ title: 'One', author });
    await createAsset({ title: 'Two', author });
    await createAsset({ title: 'Three', author: `${author} Jr` });
    const data = await list({ author: author.toUpperCase() });
    expect(data).toHaveLength(2);
    expect(data.every((asset) => asset.author === author)).toBe(true);
  });

  it('trims the author filter', async () => {
    const author = unique('Author');
    await createAsset({ title: 'Only', author });
    expect(await list({ author: `  ${author}  ` })).toHaveLength(1);
  });

  it('filters by status', async () => {
    const author = unique('Author');
    await createAsset({ title: 'A', author, status: 'available' });
    await createAsset({ title: 'B', author, status: 'on_loan' });
    await createAsset({ title: 'C', author, status: 'lost' });
    const data = await list({ author, status: 'lost' });
    expect(data.map((asset) => asset.title)).toEqual(['C']);
  });

  it('filters by a case-insensitive title substring', async () => {
    const author = unique('Author');
    const token = unique('Token').replace(' ', '');
    await createAsset({ title: `The ${token} Story`, author });
    await createAsset({ title: 'Unrelated', author });
    const data = await list({ author, q: token.toUpperCase() });
    expect(data.map((asset) => asset.title)).toEqual([`The ${token} Story`]);
  });

  it('combines filters with AND', async () => {
    const author = unique('Author');
    const token = unique('Token').replace(' ', '');
    await createAsset({ title: `Alpha ${token}`, author, status: 'lost' });
    await createAsset({ title: `Beta ${token}`, author, status: 'lost' });
    await createAsset({ title: `Alpha ${token}`, author, status: 'available' });
    const data = await list({ author, status: 'lost', q: `alpha ${token}` });
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ title: `Alpha ${token}`, status: 'lost' });
  });

  it('returns an empty list when nothing matches', async () => {
    const res = await api('GET', `/assets${query({ author: unique('Nobody') })}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [] });
  });

  it.each([
    ['an unknown status', '?status=borrowed', 'status'],
    ['an unknown parameter', '?colour=red', 'colour'],
    ['a blank author', '?author=%20%20', 'author'],
    ['a repeated parameter', '?author=a&author=b', 'author'],
    ['an over-long q', `?q=${'a'.repeat(201)}`, 'q'],
    ['an over-long author', `?author=${'a'.repeat(101)}`, 'author'],
  ])('rejects %s with 400', async (_name, search, field) => {
    const res = await api('GET', `/assets${search}`);
    expectError(res, 400, 'VALIDATION_ERROR');
    assertMatchesContract('GET', '/assets', 400, res.body);
    expectDetailFor(res, field);
  });
});
```

- [ ] **Step 9: `evaluator/oracle/acceptance/errors.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { api, expectError } from './helpers.js';

describe('HTTP semantics', () => {
  it('returns 404 NOT_FOUND as JSON for an unknown route', async () => {
    expectError(await api('GET', '/no-such-route'), 404, 'NOT_FOUND');
  });

  it.each([
    ['DELETE', '/assets', 'GET, POST'],
    ['PATCH', '/assets', 'GET, POST'],
    ['PUT', '/assets/00000000-0000-4000-8000-000000000000', 'GET'],
    ['DELETE', '/assets/00000000-0000-4000-8000-000000000000', 'GET'],
    ['POST', '/ping', 'GET'],
  ])('returns 405 for %s %s with Allow: %s', async (method, path, allow) => {
    const res = await api(method, path);
    expectError(res, 405, 'METHOD_NOT_ALLOWED');
    expect(res.headers.get('allow')).toBe(allow);
  });

  it('does not reveal the server framework', async () => {
    expect((await api('GET', '/ping')).headers.get('x-powered-by')).toBeNull();
  });

  it('sends X-Content-Type-Options: nosniff', async () => {
    expect((await api('GET', '/ping')).headers.get('x-content-type-options')).toBe('nosniff');
  });
});
```

- [ ] **Step 10: Run helper test, typecheck, commit**

Run: `cd evaluator && npx vitest run test/acceptance-helpers.test.ts && npm run typecheck`
Expected: PASS; exit 0.

```bash
git add evaluator
git commit -m "feat(evaluator): hidden black-box acceptance suite"
```

---

### Task 5: Golden server (proves the suite; behaviour baseline source)

**Files:**
- Create: `evaluator/oracle/golden-server.ts`
- Test: `evaluator/test/golden-server.test.ts`

**Interfaces:**
- Produces: `createGoldenServer(log?: (line: string) => void): Server`. CLI `npm run golden` (port from `PORT`, default 3999). It logs exactly what the app is required to log.

- [ ] **Step 1: Write the failing test `evaluator/test/golden-server.test.ts`**

```ts
import { spawnSync } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGoldenServer } from '../oracle/golden-server.js';

const lines: string[] = [];
const server = createGoldenServer((line) => lines.push(line));
let baseUrl = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function runAcceptance(): number {
  const config = fileURLToPath(new URL('../oracle/acceptance/vitest.config.ts', import.meta.url));
  const result = spawnSync('npx', ['vitest', 'run', '--config', config], { env: { ...process.env, BASE_URL: baseUrl }, encoding: 'utf8' });
  if (result.status !== 0) process.stderr.write(`${result.stdout}\n${result.stderr}`);
  return result.status ?? 1;
}

describe('golden server', () => {
  it('passes the acceptance suite', () => {
    expect(runAcceptance()).toBe(0);
  });

  it('passes it again against the same data', () => {
    expect(runAcceptance()).toBe(0);
  });

  it('logs exactly one http_response line per response and nothing else', () => {
    expect(lines.length).toBeGreaterThan(50);
    for (const line of lines) {
      const entry = JSON.parse(line) as Record<string, unknown>;
      expect(entry.event).toBe('http_response');
      expect(Object.keys(entry).sort()).toEqual(['durationMs', 'event', 'level', 'method', 'path', 'status']);
      expect(String(entry.path)).not.toContain('?');
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd evaluator && npx vitest run test/golden-server.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `evaluator/oracle/golden-server.ts`**

```ts
// Independent, dependency-free implementation of the contract and the instructions' decisions log.
// It proves the acceptance suite and produces the behaviour baseline. Never shipped to a build.
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';

type Status = 'available' | 'on_loan' | 'lost';

interface Asset {
  id: string;
  title: string;
  author: string;
  isbn: string | null;
  status: Status;
  createdAt: string;
}

interface Issue {
  field: string;
  issue: string;
}

interface Filter {
  author?: string;
  status?: string;
  q?: string;
}

const STATUSES: readonly string[] = ['available', 'on_loan', 'lost'];
const ASSET_FIELDS: readonly string[] = ['title', 'author', 'isbn', 'status'];
const FILTER_FIELDS: readonly string[] = ['author', 'status', 'q'];
const BODY_LIMIT = 10 * 1024;

export function normaliseIsbn(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

export function isValidIsbn(isbn: string): boolean {
  if (/^\d{9}[\dX]$/.test(isbn)) {
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      const char = isbn.charAt(i);
      sum += (char === 'X' ? 10 : Number(char)) * (10 - i);
    }
    return sum % 11 === 0;
  }
  if (/^\d{13}$/.test(isbn)) {
    let sum = 0;
    for (let i = 0; i < 13; i++) sum += Number(isbn.charAt(i)) * (i % 2 === 0 ? 1 : 3);
    return sum % 10 === 0;
  }
  return false;
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', ...headers });
  res.end(JSON.stringify(body));
}

function fail(res: ServerResponse, status: number, code: string, message: string, details?: Issue[], headers: Record<string, string> = {}): void {
  send(res, status, { error: details ? { code, message, details } : { code, message } }, headers);
}

function readBody(req: IncomingMessage): Promise<{ tooLarge: boolean; text: string }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > BODY_LIMIT) tooLarge = true;
      else chunks.push(chunk);
    });
    req.on('end', () => resolve({ tooLarge, text: Buffer.concat(chunks).toString('utf8') }));
    req.on('error', reject);
  });
}

function validateNewAsset(body: unknown): { value?: Omit<Asset, 'id' | 'createdAt'>; issues: Issue[] } {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { issues: [{ field: 'body', issue: 'must be a JSON object' }] };
  }
  const input = body as Record<string, unknown>;
  const issues: Issue[] = [];
  for (const key of Object.keys(input)) {
    if (!ASSET_FIELDS.includes(key)) issues.push({ field: key, issue: 'is not allowed' });
  }
  const text = (field: 'title' | 'author', max: number): string => {
    const value = input[field];
    if (typeof value !== 'string') {
      issues.push({ field, issue: 'is required and must be a string' });
      return '';
    }
    const trimmed = value.trim();
    if (trimmed.length < 1 || trimmed.length > max) issues.push({ field, issue: `must be 1-${max} characters` });
    return trimmed;
  };
  const title = text('title', 200);
  const author = text('author', 100);
  let isbn: string | null = null;
  if (input.isbn !== undefined && input.isbn !== null) {
    if (typeof input.isbn !== 'string' || !isValidIsbn(normaliseIsbn(input.isbn))) {
      issues.push({ field: 'isbn', issue: 'must be a valid ISBN-10 or ISBN-13' });
    } else {
      isbn = normaliseIsbn(input.isbn);
    }
  }
  let status: Status = 'available';
  if (input.status !== undefined) {
    if (typeof input.status !== 'string' || !STATUSES.includes(input.status)) {
      issues.push({ field: 'status', issue: 'must be one of available, on_loan, lost' });
    } else {
      status = input.status as Status;
    }
  }
  return issues.length > 0 ? { issues } : { value: { title, author, isbn, status }, issues };
}

function parseFilter(params: URLSearchParams): { filter?: Filter; issues: Issue[] } {
  const issues: Issue[] = [];
  const filter: Filter = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    if (!FILTER_FIELDS.includes(key)) {
      issues.push({ field: key, issue: 'is not a supported filter' });
      continue;
    }
    if (values.length > 1) {
      issues.push({ field: key, issue: 'must be given once' });
      continue;
    }
    const value = (values[0] ?? '').trim();
    if (key === 'status') {
      if (STATUSES.includes(value)) filter.status = value;
      else issues.push({ field: key, issue: 'must be one of available, on_loan, lost' });
      continue;
    }
    const max = key === 'author' ? 100 : 200;
    if (value.length < 1 || value.length > max) issues.push({ field: key, issue: `must be 1-${max} characters` });
    else filter[key as 'author' | 'q'] = value;
  }
  return issues.length > 0 ? { issues } : { filter, issues };
}

async function create(req: IncomingMessage, res: ServerResponse, assets: Asset[]): Promise<void> {
  const mediaType = (req.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') {
    fail(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json');
    return;
  }
  const { tooLarge, text } = await readBody(req);
  if (tooLarge) {
    fail(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body must be 10 kb or smaller');
    return;
  }
  let body: unknown;
  try {
    body = text.length === 0 ? {} : JSON.parse(text);
  } catch {
    fail(res, 400, 'VALIDATION_ERROR', 'Request body is not valid JSON', [{ field: 'body', issue: 'must be valid JSON' }]);
    return;
  }
  const { value, issues } = validateNewAsset(body);
  if (!value) {
    fail(res, 400, 'VALIDATION_ERROR', 'Request body is invalid', issues);
    return;
  }
  if (value.isbn !== null && assets.some((asset) => asset.isbn === value.isbn)) {
    fail(res, 409, 'CONFLICT', 'An asset with this ISBN already exists');
    return;
  }
  const asset: Asset = { id: randomUUID(), ...value, createdAt: new Date().toISOString() };
  assets.push(asset);
  send(res, 201, asset, { location: `/assets/${asset.id}` });
}

function list(res: ServerResponse, url: URL, assets: Asset[]): void {
  const { filter, issues } = parseFilter(url.searchParams);
  if (!filter) {
    fail(res, 400, 'VALIDATION_ERROR', 'Query is invalid', issues);
    return;
  }
  const author = filter.author?.toLowerCase();
  const q = filter.q?.toLowerCase();
  const data = assets.filter(
    (asset) =>
      (author === undefined || asset.author.toLowerCase() === author) &&
      (filter.status === undefined || asset.status === filter.status) &&
      (q === undefined || asset.title.toLowerCase().includes(q)),
  );
  send(res, 200, { data });
}

function methodNotAllowed(res: ServerResponse, allow: string): void {
  fail(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed', undefined, { allow });
}

async function route(req: IncomingMessage, res: ServerResponse, url: URL, assets: Asset[]): Promise<void> {
  const method = req.method ?? 'GET';
  const isGet = method === 'GET' || method === 'HEAD';
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path === '/ping') {
    if (isGet) send(res, 200, { status: 'ok' });
    else methodNotAllowed(res, 'GET');
    return;
  }
  if (path === '/assets') {
    if (isGet) list(res, url, assets);
    else if (method === 'POST') await create(req, res, assets);
    else methodNotAllowed(res, 'GET, POST');
    return;
  }
  const match = /^\/assets\/([^/]+)$/.exec(path);
  if (match) {
    if (!isGet) {
      methodNotAllowed(res, 'GET');
      return;
    }
    const asset = assets.find((candidate) => candidate.id === decodeURIComponent(match[1] ?? ''));
    if (asset) send(res, 200, asset);
    else fail(res, 404, 'NOT_FOUND', 'Asset not found');
    return;
  }
  fail(res, 404, 'NOT_FOUND', 'Route not found');
}

export function createGoldenServer(log: (line: string) => void = (line) => process.stdout.write(`${line}\n`)): Server {
  const assets: Asset[] = [];
  return createServer((req, res) => {
    const started = performance.now();
    const url = new URL(req.url ?? '/', 'http://localhost');
    res.on('finish', () => {
      log(JSON.stringify({ level: 'info', event: 'http_response', method: req.method, path: url.pathname, status: res.statusCode, durationMs: performance.now() - started }));
    });
    route(req, res, url, assets).catch((err: unknown) => {
      const error = err instanceof Error ? err : new Error(String(err));
      log(JSON.stringify({ level: 'error', event: 'error', name: error.name, message: error.message, stack: error.stack }));
      fail(res, 500, 'INTERNAL_ERROR', 'Internal server error');
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  createGoldenServer().listen(Number(process.env.PORT ?? 3999));
}
```

- [ ] **Step 4: Run the golden test**

Run: `cd evaluator && npx vitest run test/golden-server.test.ts && npm run typecheck`
Expected: PASS. If an acceptance test fails, decide which side is wrong using `instructions.md` §4 (Task 6) and the contract. Fix that side only, and say which side and why in the commit message.

- [ ] **Step 5: Commit**

```bash
git add evaluator
git commit -m "test(evaluator): golden server passes the acceptance suite twice"
```

---

### Task 6: Shelfwright instructions template and assembler

**Files:**
- Create: `shelfwright/src/assemble.ts`, `shelfwright/scripts/assemble.ts`, `shelfwright/instructions.template.md`
- Generate: `instructions.md`
- Test: `shelfwright/test/assemble.test.ts`

**Interfaces:**
- Produces:
  - `sha256(text: string): string`
  - `renderContract(yaml: string): string`, which emits `<!-- BEGIN contract/openapi.yaml -->`, a ````` ````yaml ````` fence, the content, the closing fence, then `<!-- END contract/openapi.yaml -->`
  - `assemble(template: string, contract: string): string`, which replaces `{{CONTRACT}}` once and `{{CONTRACT_SHA256}}` everywhere
  - `FORBIDDEN_VOCABULARY: RegExp`
  - The dependency and script tables in `instructions.md` sit between `<!-- DEPENDENCIES-BEGIN -->`/`<!-- DEPENDENCIES-END -->` and `<!-- SCRIPTS-BEGIN -->`/`<!-- SCRIPTS-END -->`. Row formats:
    - dependency: `| <workspace> | <section> | \`<package>\` | \`<version>\` |`
    - script: `| <workspace> | \`<name>\` | \`<command>\` |`
    - workspace is one of `root|backend|frontend`

- [ ] **Step 1: Write the failing test `shelfwright/test/assemble.test.ts`**

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { assemble, FORBIDDEN_VOCABULARY, renderContract, sha256 } from '../src/assemble.js';

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
const contract = read('../contract/openapi.yaml');
const template = read('../instructions.template.md');

describe('renderContract', () => {
  it('wraps the contract in markers and a four-backtick fence', () => {
    expect(renderContract('a: 1\n')).toBe('<!-- BEGIN contract/openapi.yaml -->\n````yaml\na: 1\n````\n<!-- END contract/openapi.yaml -->');
  });

  it('rejects content without a trailing newline or with a four-backtick fence', () => {
    expect(() => renderContract('a: 1')).toThrow(/newline/);
    expect(() => renderContract('````\n')).toThrow(/backticks/);
  });
});

describe('assemble', () => {
  it('replaces both placeholders', () => {
    const out = assemble('{{CONTRACT}}\nhash {{CONTRACT_SHA256}} and {{CONTRACT_SHA256}}\n', 'a: 1\n');
    expect(out).toContain('````yaml\na: 1\n````');
    expect(out.match(new RegExp(sha256('a: 1\n'), 'g'))).toHaveLength(2);
  });

  it('requires {{CONTRACT}} exactly once and {{CONTRACT_SHA256}} at least once', () => {
    expect(() => assemble('{{CONTRACT_SHA256}}', 'a\n')).toThrow(/exactly once/);
    expect(() => assemble('{{CONTRACT}}{{CONTRACT}}{{CONTRACT_SHA256}}', 'a\n')).toThrow(/exactly once/);
    expect(() => assemble('{{CONTRACT}}', 'a\n')).toThrow(/CONTRACT_SHA256/);
  });

  it('fails on unknown placeholders', () => {
    expect(() => assemble('{{CONTRACT}}{{CONTRACT_SHA256}}{{OTHER}}', 'a\n')).toThrow(/Unreplaced placeholder \{\{OTHER\}\}/);
  });
});

describe('the real instructions.md', () => {
  const assembled = assemble(template, contract);

  it('embeds the contract byte-for-byte and its correct hash', () => {
    const block = /<!-- BEGIN contract\/openapi.yaml -->\n````yaml\n([\s\S]*?)````\n<!-- END contract\/openapi.yaml -->/.exec(assembled);
    expect(block?.[1]).toBe(contract);
    expect(assembled).toContain(sha256(contract));
  });

  it('never mentions evaluation', () => {
    expect(assembled.match(FORBIDDEN_VOCABULARY)).toBeNull();
  });

  it('has dependency and script tables', () => {
    expect(assembled).toMatch(/<!-- DEPENDENCIES-BEGIN -->[\s\S]+<!-- DEPENDENCIES-END -->/);
    expect(assembled).toMatch(/<!-- SCRIPTS-BEGIN -->[\s\S]+<!-- SCRIPTS-END -->/);
  });

  it('is committed up to date at the repo root', () => {
    expect(read('../../instructions.md')).toBe(assembled);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd shelfwright && npx vitest run test/assemble.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `shelfwright/src/assemble.ts`**

```ts
import { createHash } from 'node:crypto';

const CONTRACT_PATH = 'contract/openapi.yaml';

// instructions.md is for building the app. It must not mention how builds are assessed.
export const FORBIDDEN_VOCABULARY = /\b(evaluat\w*|scorer|scorecard|scoring|judge\w*|oracle|golden|harness|examiner|grader|grading)\b/i;

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function renderContract(yaml: string): string {
  if (!yaml.endsWith('\n')) throw new Error('openapi.yaml must end with a newline');
  if (yaml.includes('````')) throw new Error('openapi.yaml must not contain four backticks');
  return [`<!-- BEGIN ${CONTRACT_PATH} -->`, '````yaml', `${yaml}\`\`\`\``, `<!-- END ${CONTRACT_PATH} -->`].join('\n');
}

export function assemble(template: string, contract: string): string {
  if (template.split('{{CONTRACT}}').length !== 2) throw new Error('Template must contain {{CONTRACT}} exactly once');
  if (!template.includes('{{CONTRACT_SHA256}}')) throw new Error('Template must contain {{CONTRACT_SHA256}}');
  const result = template
    .replace('{{CONTRACT}}', () => renderContract(contract))
    .replaceAll('{{CONTRACT_SHA256}}', () => sha256(contract));
  const leftover = /\{\{[A-Z_0-9]+\}\}/.exec(result);
  if (leftover) throw new Error(`Unreplaced placeholder ${leftover[0]}`);
  return result;
}
```

- [ ] **Step 4: Write `shelfwright/scripts/assemble.ts`**

```ts
// Builds ../instructions.md. With --check, exits 1 if the committed file is stale.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assemble } from '../src/assemble.js';

const at = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
const output = at('../../instructions.md');
const result = assemble(readFileSync(at('../instructions.template.md'), 'utf8'), readFileSync(at('../contract/openapi.yaml'), 'utf8'));

if (process.argv.includes('--check')) {
  if (!existsSync(output) || readFileSync(output, 'utf8') !== result) {
    process.stderr.write('instructions.md is stale: run `npm run assemble` in shelfwright/\n');
    process.exit(1);
  }
} else {
  writeFileSync(output, result);
}
```

- [ ] **Step 5: Write `shelfwright/instructions.template.md`**

````markdown
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
   - Do not add `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `.skip`, `.only`, `.todo`, or `istanbul`/`v8`/`c8 ignore` comments.
   - Do not delete or loosen a test to make it pass. Do not exclude files from coverage beyond what §6 allows.
4. **Dependencies are exact.** Use only the packages in the dependency table (§6.3), at exactly those versions, with no `^` or `~`. Do not add, remove or upgrade anything. Always pass `--ignore-scripts` to `npm install` and `npm ci`. Never run `npm audit fix`. Exact, known-safe versions avoid pulling a newly published compromised release.
5. **No outside code.** Download nothing except npm packages, through npm. Never pipe anything from the network into a shell.
6. **No secrets.** The service has none. Configuration comes only from the environment variables in §4.4.
7. **Logging is restricted** (§4.3). Only `backend/src/logger.ts` and `frontend/src/logger.ts` may use `console`. ESLint enforces this.
8. **Where this file is silent,** choose the simplest option consistent with the contract and §4. Record every such choice under "Unspecified decisions" in `BUILD_REPORT.md`. There is nobody to ask.
9. **Commit as you go.** In Phase 2, commit after each checklist item (`backend <n>: <behaviour>`). Commit after every gate (`phase <n>: <name>`).

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
| `title` | Required string. Trimmed. 1–200 characters after trimming. | Reject blank and runaway input. |
| `author` | Required string. Trimmed. 1–100 characters after trimming. | As above. |
| `isbn` | Optional; `null` or omitted means "no ISBN". Spaces and hyphens are removed and `x` is upper-cased. It must then be a valid ISBN-10 (9 digits + digit or `X`, mod-11 checksum) or ISBN-13 (13 digits, mod-10 checksum). Stored and returned normalised. An empty string is invalid. | People type ISBNs with hyphens; one canonical form makes uniqueness meaningful. |
| ISBN uniqueness | No two assets share a normalised ISBN → `409 CONFLICT`. ISBN-10 and ISBN-13 forms of the same book are **not** treated as equal. Assets without an ISBN may share title and author. | Catch double registration; libraries hold copies of items without ISBNs. |
| `status` | `available` \| `on_loan` \| `lost`; default `available`. Set only at creation. No endpoint changes it. | The brief asks for register and list only. |
| `id` | UUID v4 from `crypto.randomUUID()`. | Unguessable; no coordination. |
| `createdAt` | `new Date().toISOString()` at creation (UTC). | |
| Unknown POST fields | Rejected with `400`; one detail per unknown field, `field` = its name. | Fail loudly; silent dropping hides client bugs. |
| Persistence | In memory, behind an async `AssetRepository` interface. Data is lost on restart. | Enough for this service. The interface makes a database a one-file change (§4.6). |

### 4.2 HTTP behaviour

| Topic | Decision |
|---|---|
| Base path | The backend serves `/ping` and `/assets` at its root. The frontend reaches it through `/api`, which the Vite dev proxy strips. |
| Filters on `GET /assets` | `author`: case-insensitive exact match. `status`: one of the enum values. `q`: case-insensitive substring of `title`. All values are trimmed first. Filters combine with AND. |
| Invalid query | An unknown parameter, a repeated parameter, a value that is empty after trimming, `author` over 100 characters, `q` over 200 characters, or an unknown `status` → `400 VALIDATION_ERROR` with a detail whose `field` is the parameter name. |
| List order and shape | Creation order, oldest first. Body `{"data": [...]}`. No pagination. |
| `GET /assets/{id}` | `200` with the asset. Otherwise `404 NOT_FOUND`, including ids that are not UUIDs. |
| `POST /assets` success | `201`; the body is the created asset; header `Location: /assets/<id>`. |
| Content type | `POST /assets` needs a `Content-Type` whose media type (before any `;`) is `application/json`, case-insensitive. Otherwise `415 UNSUPPORTED_MEDIA_TYPE`. This is checked before the body is read. Do **not** use `req.is()` for this, because it returns `null` when there is no body. |
| Body size | More than 10 kb (10240 bytes) → `413 PAYLOAD_TOO_LARGE`. |
| Body shape | Malformed JSON, or a JSON value that is not an object → `400 VALIDATION_ERROR` with detail `field: "body"`. An empty body with a JSON content type is treated as `{}`. |
| Wrong method | `405 METHOD_NOT_ALLOWED` with the header `Allow: GET, POST` for `/assets`, and `Allow: GET` for `/assets/{id}` and `/ping`. |
| Unknown path | `404 NOT_FOUND`. |
| Unexpected failure | `500 INTERNAL_ERROR` with the message `Internal server error`. Never send stack traces or internal messages. |
| Error body | Always `{"error": {"code", "message", "details"?}}`. `details` (an array of `{field, issue}`, at least one) appears on `VALIDATION_ERROR` and on nothing else. `message` and `issue` are human-readable text; the wording is up to you. |
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
| Versions | Exact pins only, each published at least 14 days before it was pinned. Exact, known-safe versions avoid newly published compromised releases, a risk that is more common now that agents install packages. The lockfile is created during the build, so transitive versions can drift over time. This is a known limitation. |
| Install scripts | Disabled (`--ignore-scripts`) everywhere, to shrink the supply-chain attack surface. |
| Test-driven development | Every behaviour starts as a failing test. This includes the contract tests, which you write yourself from `contract/openapi.yaml` before the code they check. |
| Contract tests | `contract/contract-helper.ts` validates bodies against `contract/openapi.yaml`. Every backend HTTP test and every frontend mock response goes through it. |
| Backend coverage | 100% lines, branches, functions and statements. `backend/src/server.ts` is the only exclusion. |
| Frontend tests | Behavioural tests for the form, the list and filters, and API logging. No coverage threshold. |
| Validation | The server is the single source of truth. The frontend does not repeat the rules and has no `required` attributes; it shows the server's `details`. |

### 4.6 Not included in this build

These would be added for a production service. They are deliberately left out here.

| Feature | Production approach |
|---|---|
| Persistent database | SQLite for small scale, PostgreSQL for larger deployments, implemented behind `AssetRepository`. |
| Bulk import | A CSV import of a large number of books through the API (for example `POST /assets/import` with `text/csv`), validated row by row with a per-row error report. |
| Authentication and authorisation | Required before any real deployment. |
| Deployment packaging | Containers and a deployment pipeline, decided separately. |

## 5. Target layout

```
.
├── instructions.md  BUILD_REPORT.md  README.md
├── .nvmrc  .gitignore  package.json  package-lock.json
├── tsconfig.base.json  tsconfig.json  eslint.config.js
├── contract/    openapi.yaml  validate-spec.ts  contract-helper.ts  contract-helper.test.ts
├── scripts/     smoke.ts
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
  No manifest may have install hooks (`preinstall`, `install`, `postinstall`, `prepare`).
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
  - sets `no-console: "error"` everywhere, turned off only for `backend/src/logger.ts` and `frontend/src/logger.ts`.
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
| root | `contract:validate` | `tsx contract/validate-spec.ts` |
| root | `test:contract` | `vitest run --dir contract` |
| root | `test` | `npm run test:contract && npm run test:coverage -w backend && npm run test -w frontend` |
| root | `smoke` | `npm run build -w backend && tsx scripts/smoke.ts` |
| root | `verify` | `npm run typecheck && npm run lint && npm run contract:validate && npm test && npm run build -w frontend && npm run smoke && npm audit --audit-level=high` |
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
| root | devDependencies | `@eslint/js` | `9.39.5` |
| root | devDependencies | `@types/node` | `24.19.0` |
| root | devDependencies | `@vitest/coverage-v8` | `4.1.11` |
| root | devDependencies | `ajv` | `8.20.0` |
| root | devDependencies | `ajv-formats` | `3.0.1` |
| root | devDependencies | `eslint` | `9.39.5` |
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
| frontend | devDependencies | `@testing-library/jest-dom` | `6.10.0` |
| frontend | devDependencies | `@testing-library/react` | `16.3.3` |
| frontend | devDependencies | `@testing-library/user-event` | `14.6.7` |
| frontend | devDependencies | `@types/react` | `19.3.0` |
| frontend | devDependencies | `@types/react-dom` | `19.3.0` |
| frontend | devDependencies | `@vitejs/plugin-react` | `5.2.0` |
| frontend | devDependencies | `jsdom` | `27.4.0` |
| frontend | devDependencies | `msw` | `2.15.0` |
| frontend | devDependencies | `vite` | `7.3.6` |
<!-- DEPENDENCIES-END -->

## 7. Phases

### Phase 0: Preflight

1. Run `node --version`, `npm --version` and `git --version`. If Node is not 24.x, stop now and report it (ground rule 2).
2. Make sure the working directory contains this file as `instructions.md`. If you received the text another way, save it unchanged as `instructions.md`.
3. Run `git init` if this is not already a git repository. If `git config user.email` prints nothing, set a repo-local identity: `git config user.name "Shelfwright"` and `git config user.email "shelfwright@example.invalid"`.

**Gate:** `node -e "process.exit(process.versions.node.startsWith('24.') ? 0 : 1)"`
Commit: `phase 0: preflight`.

### Phase 1: Scaffold

1. Copy the contract from Appendix A to `contract/openapi.yaml`, byte-for-byte. Take everything between the opening ````` ````yaml ````` line and the closing ````` ```` ````` line, excluding those two lines, and keep the final newline. The gate checks its SHA-256. If the check fails, copy it again rather than editing it.
2. Create every file in §6.1, with `scripts` and dependencies exactly as in §6.2 and §6.3.
3. Run `npm install --ignore-scripts`. This creates `package-lock.json`.

**Gate:**

```sh
node -e "const {createHash}=require('node:crypto');const {readFileSync}=require('node:fs');process.exit(createHash('sha256').update(readFileSync('contract/openapi.yaml')).digest('hex')==='{{CONTRACT_SHA256}}'?0:1)" && npm run contract:validate && npx tsc -p tsconfig.json && npx eslint .
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
export function parseNewAsset(body: unknown): ParseResult<NewAsset>;                          // uses Zod; never throws
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
- builds the app with `InMemoryAssetRepository`, `consoleLogger`, `() => new Date()` and `randomUUID` from `node:crypto`, and listens;
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
5. Routes from `routes/ping.ts` and `routes/assets.ts`, using `router.route(path)`. Each route ends with `.all(methodNotAllowed('<Allow value>'))`. The `POST /assets` chain is `requireJson` → `express.json({ limit: '10kb' })` → handler.
6. `notFound` → `404 NOT_FOUND`.
7. `errorHandler`, mapping errors as follows:
   - body-parser `type === 'entity.too.large'` → 413;
   - `'entity.parse.failed'` → 400 with detail `{ field: 'body' }`;
   - `'encoding.unsupported'` or `'charset.unsupported'` → 415;
   - `HttpError` → its status, code and details;
   - anything else → `logger.error(err)`, then `500 INTERNAL_ERROR`.

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
`assertMatchesSchema('Error', body)` instead.

Domain (`test/domain/`):
1. `normaliseIsbn` removes spaces and hyphens and upper-cases `x`.
2. `isValidIsbn` accepts `0306406152`, `080442957X` and `9780306406157`. It rejects a wrong checksum (`0306406153`, `9780306406158`), the wrong length, any letter except a final `X` on ISBN-10, and `X` in an ISBN-13.
3. `parseNewAsset` on a valid minimal body returns defaults (`isbn: null`, `status: 'available'`) and trimmed strings.
4. `parseNewAsset` reports the right `field` for:
   - `title` and `author` that are missing, blank, too long or not strings;
   - an invalid or non-string `isbn`;
   - an invalid `status`;
   - each unknown key (field = the key);
   - a body that is `null`, an array, a string or `undefined` (field `body`).
   Several problems produce several issues.
5. `parseAssetFilter`:
   - `{}` → `{}`;
   - each valid filter is trimmed and returned;
   - errors for: an unknown key, a repeated key (array value), a value blank after trimming, `author` > 100, `q` > 200, an invalid `status`.

Repository (`test/repo/`):
6. `add`, then `findById` / `findByIsbn`; a missing value gives `undefined`.
7. `list`:
   - returns creation order;
   - filters by author (case-insensitive exact), status, and `q` (case-insensitive title substring);
   - combines filters with AND;
   - mutating a returned array or asset does not change the store.

Logger (`test/logger.test.ts`, spying on `console.log` and `console.error`):
8. `httpResponse` writes exactly one JSON line with `level`, `event`, `method`, `path`, `status` and `durationMs`.
9. `error` writes `name`, `message` and `stack` for an `Error`, and `NonError` for a thrown non-Error value.

HTTP (`test/http/`, Supertest against `makeTestApp().app`):
10. `GET /ping` → 200 `{ status: 'ok' }`. `POST /ping` → 405 with `Allow: GET`.
11. A valid `POST /assets` → 201. The body equals the stored asset with the fixed id and `createdAt`, plus `Location: /assets/<id>`.
12. `POST /assets` validation errors → 400 with details (one case per rule; the domain tests cover the rest).
13. A duplicate ISBN, including one formatted differently, → 409 `CONFLICT`.
14. `POST /assets` with `text/plain`, or with no `Content-Type`, → 415.
15. `POST /assets` responses:
    - malformed JSON → 400 with field `body`;
    - an empty body with a JSON content type → 400 with fields `title` and `author`;
    - a body over 10 kb → 413.
16. `GET /assets/:id` → 200; an unknown id → 404; `PUT /assets/:id` → 405 with `Allow: GET`.
17. `GET /assets`:
    - returns `{ data }` in creation order;
    - covers each filter and combined filters;
    - an invalid query → 400;
    - `DELETE /assets` → 405 with `Allow: GET, POST`.
18. An unknown route → 404 `NOT_FOUND`.
19. When the repository throws (inject one with `makeTestApp({ repo })`), the response is 500 `INTERNAL_ERROR` with the generic message and no stack, and there is exactly one `logs.errors` entry.
20. Every response logs exactly one `logs.responses` entry with the right status and a `path` without a query string. 4xx responses log nothing to `logs.errors`.
21. Responses have no `X-Powered-By` and include `X-Content-Type-Options: nosniff` and `Access-Control-Allow-Origin: http://localhost:5173`. A CORS preflight (`OPTIONS /assets` with `Origin` and `Access-Control-Request-Method: POST`) returns 204.
22. `Content-Type: application/json; charset=latin1` → 415. This covers the charset branch of the error handler.

#### 2.4 Smoke script

Write `scripts/smoke.ts`. It must:
1. Start `node backend/dist/server.js` with `PORT=3999`, inheriting stdout and stderr.
2. Wait up to 20 seconds for `GET /ping` to return 200.
3. `POST /assets` with a valid book and expect 201.
4. `GET` the returned `Location` path and expect 200 with the same body.
5. `GET /assets?q=<that title>` and expect the book in `data`.
6. Stop the server with `SIGTERM`.

It exits 0 on success. On failure it throws, which exits non-zero. It prints nothing of its own.

**Gate:** `npm run test:contract && npm run test:coverage -w backend && npm run smoke && npx tsc -p tsconfig.json && npm run typecheck -w backend && npx eslint .`
Commit: `phase 2: backend`.

### Phase 3: Frontend

Work in `frontend/`. The page reaches the backend through `/api`, using the Vite dev proxy.

#### 3.1 Modules (export exactly these names)

```ts
// frontend/src/api/types.ts
export type AssetStatus = 'available' | 'on_loan' | 'lost';
export interface Asset { id: string; title: string; author: string; isbn: string | null; status: AssetStatus; createdAt: string }
export interface NewAsset { title: string; author: string; isbn?: string | null; status?: AssetStatus }
export interface AssetFilters { author?: string; status?: AssetStatus; q?: string }
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
export function listAssets(filters: AssetFilters): Promise<Asset[]>; // GET /assets; filters go in `params`; empty values omitted
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
`unhandledrejection` that call `logError`.

#### 3.2 The page (exact user-visible text)

- `<h1>`: **Library assets**.
- **Form** (`AssetForm`, section heading `<h2>` **Register a book**):
  - Labelled inputs **Title**, **Author** and **ISBN (optional)**, and a select **Status** with options **Available** (default), **On loan** and **Lost**.
  - A submit button **Register book**, disabled while submitting. No `required` attributes and no client-side validation.
  - **201:** clear the fields, show `role="status"` text **Book registered.**, and call `onCreated(asset)`.
  - **400:** show each detail's `issue` under its input, in an element with id `<field>-error` referenced by the input's `aria-describedby`, and set `aria-invalid="true"` on the input. Details for `body` or unknown fields go in the general alert.
  - **409:** show **A book with this ISBN is already registered.** under the ISBN input, using the same mechanism.
  - **Anything else:** `role="alert"` with **Could not register the book. Please try again.**
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
- `client.test.ts`:
  - a 200 response logs `http_response` with a `url` that has no query string;
  - a 400 response logs `http_response` and rejects;
  - a network error (`HttpResponse.error()`) logs `error` and no `http_response`.
- `AssetForm.test.tsx`:
  - the happy path posts exactly `{ title, author, status: 'available' }`, with `isbn` omitted when empty, shows **Book registered.** and calls `onCreated`;
  - 400 details appear next to their fields with `aria-invalid`;
  - 409 shows the ISBN message;
  - 500 shows the general alert.
- `App.test.tsx`:
  - rows render from `GET /assets`;
  - typing in **Filter by author** sends `author=` after the debounce;
  - changing **Filter by status** sends `status=`;
  - the empty state and the error state appear;
  - registering a book refreshes the list.
- Spy on `console.info` and `console.error` where tests trigger logging, so test output stays clean.

**Gate:** `npm run test -w frontend && npm run build -w frontend && npm run typecheck && npx eslint .`
Commit: `phase 3: frontend`.

### Phase 4: Verify and report

1. Write `README.md` with these sections:
   - **Overview**
   - **Requirements**
   - **Quick start** (`npm ci --ignore-scripts`, `npm run dev -w backend`, `npm run dev -w frontend`, then open http://localhost:5173)
   - **Configuration** (the table in §4.4)
   - **API** (one line per endpoint; point to `contract/openapi.yaml`)
   - **Testing** (`npm run verify`)
   - **Observability** (the two log events)
   - **Decisions** (point to §4 of `instructions.md`)
   - **Not included** (the table in §4.6)
2. Run the gate.
3. Fill in `BUILD_REPORT.md` from Appendix B. Every phase gets **PASS** or **FAIL**, with the number of attempts.

**Gate:** `npm run verify`
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
| 1 Scaffold | contract hash, contract:validate, tsc, eslint | | | |
| 2 Backend | test:contract, test:coverage, smoke, typecheck, eslint | | | |
| 3 Frontend | frontend test, build, typecheck, eslint | | | |
| 4 Verify | npm run verify | | | |

## Backend coverage

Lines / branches / functions / statements:

## Deviations from instructions

None, or one entry per deviation: what, why, and the evidence.

## Unspecified decisions

Every choice this file did not pin, one line each.

## npm audit

Summary of `npm audit --audit-level=high` output.
```
````

- [ ] **Step 6: Generate and test**

Run: `cd shelfwright && npm run assemble && npm test && npm run check && npm run typecheck`
Expected: all PASS, including "never mentions evaluation" and "committed up to date". If the vocabulary test fails, reword the template. Never weaken the regex.

- [ ] **Step 7: Commit**

```bash
git add shelfwright instructions.md
git commit -m "feat(shelfwright): instructions template, assembler and generated instructions.md"
```

---

### Task 7: Manifest check and dependency preflight

**Files:**
- Create: `evaluator/checks/manifest-check.ts`, `evaluator/scripts/preflight.ts`
- Test: `evaluator/test/manifest-check.test.ts`

**Interfaces:**
- Produces:
  - `parseDependencyTable(markdown: string): DependencyPin[]` with `DependencyPin = { workspace: string; section: string; name: string; version: string }`
  - `parseScriptTable(markdown: string): ScriptPin[]` with `ScriptPin = { workspace: string; name: string; command: string }`
  - `checkManifests(workDir: string, instructions: string): ManifestResult` with `ManifestResult = { ok: boolean; problems: string[] }`
  - `npm run preflight`: installs the pinned table from the root `instructions.md` into a temp project (exit 0 = the pins resolve together).

- [ ] **Step 1: Write the failing test `evaluator/test/manifest-check.test.ts`**

```ts
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkManifests, parseDependencyTable, parseScriptTable } from '../checks/manifest-check.js';

const INSTRUCTIONS = [
  '<!-- SCRIPTS-BEGIN -->',
  '| Workspace | Script | Command |',
  '|---|---|---|',
  '| root | `verify` | `npm test && npm audit` |',
  '| backend | `test` | `vitest run` |',
  '<!-- SCRIPTS-END -->',
  '<!-- DEPENDENCIES-BEGIN -->',
  '| Workspace | Section | Package | Version |',
  '|---|---|---|---|',
  '| root | devDependencies | `typescript` | `5.9.3` |',
  '| backend | dependencies | `express` | `5.2.1` |',
  '<!-- DEPENDENCIES-END -->',
].join('\n');

function project(manifests: Record<string, object>): string {
  const dir = mkdtempSync(join(tmpdir(), 'sw-manifest-'));
  for (const [file, content] of Object.entries(manifests)) {
    mkdirSync(join(dir, file, '..'), { recursive: true });
    writeFileSync(join(dir, file), JSON.stringify(content));
  }
  return dir;
}

const good = {
  'package.json': { scripts: { verify: 'npm test && npm audit' }, devDependencies: { typescript: '5.9.3' } },
  'backend/package.json': { scripts: { test: 'vitest run' }, dependencies: { express: '5.2.1' } },
  'frontend/package.json': {},
};

describe('table parsing', () => {
  it('parses dependency and script rows', () => {
    expect(parseDependencyTable(INSTRUCTIONS)).toEqual([
      { workspace: 'root', section: 'devDependencies', name: 'typescript', version: '5.9.3' },
      { workspace: 'backend', section: 'dependencies', name: 'express', version: '5.2.1' },
    ]);
    expect(parseScriptTable(INSTRUCTIONS)).toEqual([
      { workspace: 'root', name: 'verify', command: 'npm test && npm audit' },
      { workspace: 'backend', name: 'test', command: 'vitest run' },
    ]);
  });

  it('fails loudly when a table is missing', () => {
    expect(() => parseDependencyTable('nothing')).toThrow(/no DEPENDENCIES table/);
  });

  it('parses the real instructions.md: every version exact', () => {
    const real = readFileSync(fileURLToPath(new URL('../../instructions.md', import.meta.url)), 'utf8');
    const pins = parseDependencyTable(real);
    expect(pins.length).toBeGreaterThan(30);
    for (const pin of pins) expect(pin.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(parseScriptTable(real).map((script) => `${script.workspace}:${script.name}`)).toContain('root:verify');
  });
});

describe('checkManifests', () => {
  it('passes matching manifests', () => {
    expect(checkManifests(project(good), INSTRUCTIONS)).toEqual({ ok: true, problems: [] });
  });

  it('catches ranges, extras, missing packages and changed scripts', () => {
    const dir = project({
      'package.json': { scripts: { verify: 'npm test', extra: 'x' }, devDependencies: { typescript: '^5.9.3', lodash: '4.17.21' } },
      'backend/package.json': { scripts: { test: 'vitest run' } },
      'frontend/package.json': {},
    });
    expect(checkManifests(dir, INSTRUCTIONS).problems).toEqual([
      'package.json devDependencies: typescript is "^5.9.3", expected exactly "5.9.3"',
      'package.json devDependencies: unexpected lodash',
      'package.json scripts.verify: expected `npm test && npm audit`, found `npm test`',
      'package.json scripts: unexpected extra',
      'backend/package.json dependencies: missing express',
    ]);
  });

  it('reports a missing manifest', () => {
    const dir = project({ 'package.json': good['package.json'], 'backend/package.json': good['backend/package.json'] });
    expect(checkManifests(dir, INSTRUCTIONS).problems).toEqual(['frontend/package.json is missing']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd evaluator && npx vitest run test/manifest-check.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `evaluator/checks/manifest-check.ts`**

```ts
// Derives expectations from the run's own instructions.md, so nothing here is a hidden requirement.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface DependencyPin {
  workspace: string;
  section: string;
  name: string;
  version: string;
}

export interface ScriptPin {
  workspace: string;
  name: string;
  command: string;
}

export interface ManifestResult {
  ok: boolean;
  problems: string[];
}

const WORKSPACE_FILES: Record<string, string> = {
  root: 'package.json',
  backend: 'backend/package.json',
  frontend: 'frontend/package.json',
};

function tableRows(markdown: string, marker: string): string[] {
  const match = new RegExp(`<!-- ${marker}-BEGIN -->([\\s\\S]*?)<!-- ${marker}-END -->`).exec(markdown);
  if (!match) throw new Error(`instructions.md has no ${marker} table`);
  return (match[1] ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && !/^\|[\s|:-]+\|$/.test(line))
    .slice(1);
}

export function parseDependencyTable(markdown: string): DependencyPin[] {
  return tableRows(markdown, 'DEPENDENCIES').map((row) => {
    const match = /^\|\s*(\w+)\s*\|\s*(\w+)\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|$/.exec(row);
    if (!match) throw new Error(`Unparseable dependency row: ${row}`);
    return { workspace: match[1] ?? '', section: match[2] ?? '', name: match[3] ?? '', version: match[4] ?? '' };
  });
}

export function parseScriptTable(markdown: string): ScriptPin[] {
  return tableRows(markdown, 'SCRIPTS').map((row) => {
    const match = /^\|\s*(\w+)\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|$/.exec(row);
    if (!match) throw new Error(`Unparseable script row: ${row}`);
    return { workspace: match[1] ?? '', name: match[2] ?? '', command: match[3] ?? '' };
  });
}

export function checkManifests(workDir: string, instructions: string): ManifestResult {
  const problems: string[] = [];
  const deps = parseDependencyTable(instructions);
  const scripts = parseScriptTable(instructions);
  for (const [workspace, file] of Object.entries(WORKSPACE_FILES)) {
    const path = join(workDir, file);
    if (!existsSync(path)) {
      problems.push(`${file} is missing`);
      continue;
    }
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    for (const section of ['dependencies', 'devDependencies']) {
      const expected = new Map(deps.filter((d) => d.workspace === workspace && d.section === section).map((d) => [d.name, d.version]));
      const actual = (manifest[section] ?? {}) as Record<string, string>;
      for (const [name, version] of expected) {
        if (!(name in actual)) problems.push(`${file} ${section}: missing ${name}`);
        else if (actual[name] !== version) problems.push(`${file} ${section}: ${name} is "${actual[name]}", expected exactly "${version}"`);
      }
      for (const name of Object.keys(actual)) {
        if (!expected.has(name)) problems.push(`${file} ${section}: unexpected ${name}`);
      }
    }
    const expectedScripts = new Map(scripts.filter((s) => s.workspace === workspace).map((s) => [s.name, s.command]));
    const actualScripts = (manifest.scripts ?? {}) as Record<string, string>;
    for (const [name, command] of expectedScripts) {
      const found = actualScripts[name];
      if (found !== command) problems.push(`${file} scripts.${name}: expected \`${command}\`, found ${found === undefined ? 'nothing' : `\`${found}\``}`);
    }
    for (const name of Object.keys(actualScripts)) {
      if (!expectedScripts.has(name)) problems.push(`${file} scripts: unexpected ${name}`);
    }
  }
  return { ok: problems.length === 0, problems };
}
```

- [ ] **Step 4: Write `evaluator/scripts/preflight.ts`**

```ts
// Installs the dependency table from ../instructions.md into a clean temp project.
// Exit 0 means the pins resolve together on a fresh machine. Run before spending agent runs.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDependencyTable } from '../checks/manifest-check.js';

const instructions = readFileSync(fileURLToPath(new URL('../../instructions.md', import.meta.url)), 'utf8');
const pins = parseDependencyTable(instructions);
const dir = mkdtempSync(join(tmpdir(), 'sw-preflight-'));

function section(workspace: string, name: string): Record<string, string> {
  return Object.fromEntries(pins.filter((p) => p.workspace === workspace && p.section === name).map((p) => [p.name, p.version]));
}

function manifest(workspace: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ name: workspace === 'root' ? 'preflight' : workspace, private: true, type: 'module', ...extra, dependencies: section(workspace, 'dependencies'), devDependencies: section(workspace, 'devDependencies') }, null, 2);
}

writeFileSync(join(dir, 'package.json'), manifest('root', { workspaces: ['backend', 'frontend'] }));
for (const workspace of ['backend', 'frontend']) {
  mkdirSync(join(dir, workspace));
  writeFileSync(join(dir, workspace, 'package.json'), manifest(workspace));
}
const result = spawnSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: dir, stdio: 'inherit' });
rmSync(dir, { recursive: true, force: true });
process.exit(result.status ?? 1);
```

- [ ] **Step 5: Run tests and preflight**

Run: `cd evaluator && npx vitest run test/manifest-check.test.ts && npm run typecheck && npm run preflight`
Expected: PASS; exit 0. If preflight fails with `ERESOLVE`, choose compatible versions that are still at least 14 days old. Update the table in `shelfwright/instructions.template.md` and the Global Constraints above, run `npm run assemble` in `shelfwright/`, then re-run.

- [ ] **Step 6: Commit**

```bash
git add evaluator shelfwright instructions.md
git commit -m "feat(evaluator): manifest check derived from instructions, dependency preflight"
```

---

### Task 8: Log check, probe, diff

**Files:**
- Create: `evaluator/checks/log-check.ts`, `evaluator/checks/probe.ts`, `evaluator/checks/diff.ts`, `evaluator/scripts/golden-probe.ts`
- Generate: `evaluator/oracle/golden-probe.json`
- Test: `evaluator/test/log-check.test.ts`, `evaluator/test/probe.test.ts`, `evaluator/test/diff.test.ts`

**Interfaces:**
- Produces:
  - `checkLogs(output: string, options?: { expectedResponses?: number; allowErrors?: boolean }): LogCheckResult`, with `LogCheckResult = { ok: boolean; responseLines: number; errorLines: number; problems: string[] }`
  - `PROBE_STEPS: ProbeStep[]`
  - `runProbe(baseUrl: string): Promise<ProbeRecord[]>`
  - `normaliseRecords(records: ProbeRecord[]): ProbeRecord[]`
  - `ProbeRecord = { name: string; method: string; path: string; status: number; contentType: string | null; location: string | null; allow: string | null; body: unknown }`
  - `compareProbes(expected: ProbeRecord[], actual: ProbeRecord[]): Difference[]`, with `Difference = { step: string; field: string; expected: unknown; actual: unknown }` (inputs already normalised)

- [ ] **Step 1: Write the failing test `evaluator/test/log-check.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { checkLogs } from '../checks/log-check.js';

const response = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ level: 'info', event: 'http_response', method: 'GET', path: '/ping', status: 200, durationMs: 1.5, ...extra });

describe('checkLogs', () => {
  it('accepts well-formed response lines', () => {
    expect(checkLogs(`${response()}\n${response()}\n`, { expectedResponses: 2 })).toEqual({ ok: true, responseLines: 2, errorLines: 0, problems: [] });
  });

  it('rejects non-JSON lines such as a startup banner', () => {
    expect(checkLogs(`Server listening on 3000\n${response()}`).problems[0]).toMatch(/not a JSON object/);
  });

  it('rejects extra keys such as a logged body', () => {
    expect(checkLogs(response({ body: { title: 'x' } })).problems[0]).toMatch(/unexpected keys body/);
  });

  it('rejects a path containing a query string', () => {
    expect(checkLogs(response({ path: '/assets?author=x' })).problems[0]).toMatch(/query string/);
  });

  it('rejects unknown events', () => {
    expect(checkLogs(JSON.stringify({ level: 'debug', event: 'started' })).problems[0]).toMatch(/unexpected event started/);
  });

  it('counts responses against the expectation', () => {
    expect(checkLogs(response(), { expectedResponses: 2 }).problems).toContain('expected 2 http_response lines, found 1');
  });

  it('flags error lines unless allowed', () => {
    const error = JSON.stringify({ level: 'error', event: 'error', name: 'Error', message: 'boom', stack: 'Error: boom' });
    expect(checkLogs(error).ok).toBe(false);
    expect(checkLogs(error, { allowErrors: true }).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Write `evaluator/checks/log-check.ts`**

```ts
// Rules from instructions.md §4.3: only http_response and error JSON lines.
export interface LogCheckResult {
  ok: boolean;
  responseLines: number;
  errorLines: number;
  problems: string[];
}

const RESPONSE_KEYS = ['durationMs', 'event', 'level', 'method', 'path', 'status'];
const ERROR_KEYS = ['event', 'level', 'message', 'name', 'stack'];
const ERROR_REQUIRED = ['event', 'level', 'message', 'name'];

export function checkLogs(output: string, options: { expectedResponses?: number; allowErrors?: boolean } = {}): LogCheckResult {
  const problems: string[] = [];
  let responseLines = 0;
  let errorLines = 0;
  const lines = output.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);

  lines.forEach((line, index) => {
    const at = `line ${index + 1}`;
    let entry: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(line);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
      entry = parsed as Record<string, unknown>;
    } catch {
      problems.push(`${at} is not a JSON object: ${line.slice(0, 120)}`);
      return;
    }
    const keys = Object.keys(entry);
    if (entry.event === 'http_response') {
      responseLines++;
      const extra = keys.filter((key) => !RESPONSE_KEYS.includes(key));
      const missing = RESPONSE_KEYS.filter((key) => !keys.includes(key));
      if (extra.length > 0) problems.push(`${at}: unexpected keys ${extra.join(', ')}`);
      if (missing.length > 0) problems.push(`${at}: missing keys ${missing.join(', ')}`);
      if (entry.level !== 'info') problems.push(`${at}: http_response must have level "info"`);
      if (typeof entry.status !== 'number' || typeof entry.durationMs !== 'number') problems.push(`${at}: status and durationMs must be numbers`);
      if (typeof entry.path !== 'string' || entry.path.includes('?')) problems.push(`${at}: path must be a string without a query string`);
    } else if (entry.event === 'error') {
      errorLines++;
      const extra = keys.filter((key) => !ERROR_KEYS.includes(key));
      const missing = ERROR_REQUIRED.filter((key) => !keys.includes(key));
      if (extra.length > 0) problems.push(`${at}: unexpected keys ${extra.join(', ')}`);
      if (missing.length > 0) problems.push(`${at}: missing keys ${missing.join(', ')}`);
      if (entry.level !== 'error') problems.push(`${at}: error must have level "error"`);
    } else {
      problems.push(`${at}: unexpected event ${String(entry.event)}`);
    }
  });

  if (options.expectedResponses !== undefined && responseLines !== options.expectedResponses) {
    problems.push(`expected ${options.expectedResponses} http_response lines, found ${responseLines}`);
  }
  if (!options.allowErrors && errorLines > 0) problems.push(`found ${errorLines} error lines; none were expected`);
  return { ok: problems.length === 0, responseLines, errorLines, problems };
}
```

- [ ] **Step 3: Run the log test**

Run: `cd evaluator && npx vitest run test/log-check.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the failing test `evaluator/test/probe.test.ts`**

```ts
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkLogs } from '../checks/log-check.js';
import { normaliseRecords, PROBE_STEPS, runProbe, type ProbeRecord } from '../checks/probe.js';
import { createGoldenServer } from '../oracle/golden-server.js';

const EXPECTED_STATUS: Record<string, number> = {
  ping: 200,
  'create-a': 201,
  'create-b': 201,
  'create-c': 201,
  'duplicate-isbn': 409,
  'missing-fields': 400,
  'bad-isbn': 400,
  'bad-status': 400,
  'unknown-field': 400,
  'malformed-json': 400,
  'wrong-content-type': 415,
  'too-large': 413,
  'list-all': 200,
  'list-author': 200,
  'list-status': 200,
  'list-q': 200,
  'list-combined': 200,
  'list-none': 200,
  'list-bad-status': 400,
  'list-unknown-param': 400,
  'list-repeated': 400,
  'get-a': 200,
  'get-missing': 404,
  'get-malformed': 404,
  'delete-assets': 405,
  'put-asset': 405,
  'post-ping': 405,
  'unknown-route': 404,
};

const lines: string[] = [];
const server = createGoldenServer((line) => lines.push(line));
let records: ProbeRecord[] = [];

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  records = await runProbe(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('probe against the golden server', () => {
  it('covers every step with the expected status', () => {
    expect(Object.keys(EXPECTED_STATUS)).toEqual(PROBE_STEPS.map((step) => step.name));
    expect(Object.fromEntries(records.map((record) => [record.name, record.status]))).toEqual(EXPECTED_STATUS);
  });

  it('logs exactly one response line per step', () => {
    expect(checkLogs(lines.join('\n'), { expectedResponses: PROBE_STEPS.length }).ok).toBe(true);
  });

  it('normalises ids, timestamps, messages and detail order', () => {
    const normalised = normaliseRecords(records);
    const createA = normalised.find((record) => record.name === 'create-a');
    expect(createA?.location).toBe('/assets/<id:1>');
    expect(createA?.body).toMatchObject({ id: '<id:1>', createdAt: '<timestamp>' });
    const missing = normalised.find((record) => record.name === 'missing-fields');
    expect(missing?.body).toEqual({ error: { code: 'VALIDATION_ERROR', message: '<text>', details: ['author', 'title'] } });
  });

  it('matches the committed golden baseline', () => {
    const baseline = JSON.parse(readFileSync(new URL('../oracle/golden-probe.json', import.meta.url), 'utf8')) as ProbeRecord[];
    expect(normaliseRecords(records)).toEqual(normaliseRecords(baseline));
  });
});
```

- [ ] **Step 5: Write `evaluator/checks/probe.ts`**

```ts
// A fixed request sequence run against every build. Normalised output is compared with the golden
// baseline: matching golden means accurate, and all runs matching golden means consistent.
export interface ProbeStep {
  name: string;
  method: string;
  path: string;
  json?: unknown;
  rawBody?: string;
  contentType?: string;
}

export interface ProbeRecord {
  name: string;
  method: string;
  path: string;
  status: number;
  contentType: string | null;
  location: string | null;
  allow: string | null;
  body: unknown;
}

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

export const PROBE_STEPS: ProbeStep[] = [
  { name: 'ping', method: 'GET', path: '/ping' },
  { name: 'create-a', method: 'POST', path: '/assets', json: { title: 'Probe Book A', author: 'Probe Author', isbn: '978-0-306-40615-7' } },
  { name: 'create-b', method: 'POST', path: '/assets', json: { title: '  Probe Book B  ', author: 'probe author', isbn: '0-306-40615-2', status: 'on_loan' } },
  { name: 'create-c', method: 'POST', path: '/assets', json: { title: 'Another Title', author: 'Someone Else', status: 'lost' } },
  { name: 'duplicate-isbn', method: 'POST', path: '/assets', json: { title: 'Dup', author: 'X', isbn: '9780306406157' } },
  { name: 'missing-fields', method: 'POST', path: '/assets', json: {} },
  { name: 'bad-isbn', method: 'POST', path: '/assets', json: { title: 'T', author: 'A', isbn: '9780306406158' } },
  { name: 'bad-status', method: 'POST', path: '/assets', json: { title: 'T', author: 'A', status: 'borrowed' } },
  { name: 'unknown-field', method: 'POST', path: '/assets', json: { title: 'T', author: 'A', colour: 'red' } },
  { name: 'malformed-json', method: 'POST', path: '/assets', rawBody: '{"title":', contentType: 'application/json' },
  { name: 'wrong-content-type', method: 'POST', path: '/assets', rawBody: 'title=T', contentType: 'text/plain' },
  { name: 'too-large', method: 'POST', path: '/assets', json: { title: 'x'.repeat(11000), author: 'A' } },
  { name: 'list-all', method: 'GET', path: '/assets' },
  { name: 'list-author', method: 'GET', path: '/assets?author=PROBE%20AUTHOR' },
  { name: 'list-status', method: 'GET', path: '/assets?status=on_loan' },
  { name: 'list-q', method: 'GET', path: '/assets?q=book' },
  { name: 'list-combined', method: 'GET', path: '/assets?author=probe%20author&status=available' },
  { name: 'list-none', method: 'GET', path: '/assets?q=zzzz' },
  { name: 'list-bad-status', method: 'GET', path: '/assets?status=borrowed' },
  { name: 'list-unknown-param', method: 'GET', path: '/assets?colour=red' },
  { name: 'list-repeated', method: 'GET', path: '/assets?author=a&author=b' },
  { name: 'get-a', method: 'GET', path: '/assets/{create-a}' },
  { name: 'get-missing', method: 'GET', path: `/assets/${MISSING_ID}` },
  { name: 'get-malformed', method: 'GET', path: '/assets/not-a-uuid' },
  { name: 'delete-assets', method: 'DELETE', path: '/assets' },
  { name: 'put-asset', method: 'PUT', path: '/assets/{create-a}' },
  { name: 'post-ping', method: 'POST', path: '/ping' },
  { name: 'unknown-route', method: 'GET', path: '/no-such-route' },
];

export async function runProbe(baseUrl: string, steps: ProbeStep[] = PROBE_STEPS): Promise<ProbeRecord[]> {
  const ids = new Map<string, string>();
  const records: ProbeRecord[] = [];
  for (const step of steps) {
    const path = step.path.replace(/\{([a-z-]+)\}/g, (_match, name: string) => ids.get(name) ?? `missing-${name}`);
    const headers: Record<string, string> = {};
    let body: string | undefined;
    if (step.json !== undefined) {
      body = JSON.stringify(step.json);
      headers['content-type'] = 'application/json';
    }
    if (step.rawBody !== undefined) body = step.rawBody;
    if (step.contentType !== undefined) headers['content-type'] = step.contentType;
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, { method: step.method, headers, body });
    const text = await res.text();
    let parsed: unknown = text.length === 0 ? null : text;
    try {
      if (text.length > 0) parsed = JSON.parse(text);
    } catch {
      // keep the raw text; it will show up as a difference
    }
    const id = (parsed as { id?: unknown } | null)?.id;
    if (res.status === 201 && typeof id === 'string') ids.set(step.name, id);
    records.push({
      name: step.name,
      method: step.method,
      path: step.path,
      status: res.status,
      contentType: res.headers.get('content-type'),
      location: res.headers.get('location'),
      allow: res.headers.get('allow'),
      body: parsed,
    });
  }
  return records;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function normaliseRecords(records: ProbeRecord[]): ProbeRecord[] {
  const tokens = new Map<string, string>();
  const token = (id: string): string => {
    const key = id.toLowerCase();
    if (!tokens.has(key)) tokens.set(key, `<id:${tokens.size + 1}>`);
    return tokens.get(key) as string;
  };
  const walk = (value: unknown, key?: string): unknown => {
    if (Array.isArray(value)) {
      if (key === 'details') return [...new Set(value.map((detail) => String((detail as { field?: unknown }).field)))].sort();
      return value.map((item) => walk(item));
    }
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, walk(child, childKey)]));
    }
    if (typeof value === 'string') {
      if (key === 'createdAt') return '<timestamp>';
      if (key === 'message' || key === 'issue') return '<text>';
      return value.replace(UUID, (match) => token(match));
    }
    return value;
  };
  return records.map((record) => {
    const contentType = record.contentType?.split(';')[0]?.trim().toLowerCase() ?? null;
    const location = record.location?.replace(UUID, (match) => token(match)) ?? null;
    return { ...record, contentType, location, body: walk(record.body) };
  });
}
```

- [ ] **Step 6: Write `evaluator/scripts/golden-probe.ts` and generate the baseline**

```ts
// Regenerates oracle/golden-probe.json. Review the diff before committing.
import { writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { runProbe } from '../checks/probe.js';
import { createGoldenServer } from '../oracle/golden-server.js';

const server = createGoldenServer(() => undefined);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const records = await runProbe(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
server.close();
writeFileSync(fileURLToPath(new URL('../oracle/golden-probe.json', import.meta.url)), `${JSON.stringify(records, null, 2)}\n`);
```

Run: `cd evaluator && npm run golden:probe && npx vitest run test/probe.test.ts`
Expected: PASS. Read `oracle/golden-probe.json` once and check each status against `instructions.md` §4.

- [ ] **Step 7: Write the failing test `evaluator/test/diff.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { compareProbes } from '../checks/diff.js';
import type { ProbeRecord } from '../checks/probe.js';

const record = (overrides: Partial<ProbeRecord> = {}): ProbeRecord => ({
  name: 'ping',
  method: 'GET',
  path: '/ping',
  status: 200,
  contentType: 'application/json',
  location: null,
  allow: null,
  body: { status: 'ok' },
  ...overrides,
});

describe('compareProbes', () => {
  it('finds no differences in identical probes, ignoring key order', () => {
    expect(compareProbes([record({ body: { a: 1, b: 2 } })], [record({ body: { b: 2, a: 1 } })])).toEqual([]);
  });

  it('reports status, header and body differences', () => {
    const diffs = compareProbes([record()], [record({ status: 500, allow: 'GET', body: { status: 'bad' } })]);
    expect(diffs.map((diff) => diff.field)).toEqual(['status', 'allow', 'body']);
  });

  it('reports missing and unexpected steps', () => {
    expect(compareProbes([record()], [])).toEqual([{ step: 'ping', field: 'missing', expected: 'present', actual: 'absent' }]);
    expect(compareProbes([], [record()])[0]?.field).toBe('unexpected');
  });
});
```

- [ ] **Step 8: Write `evaluator/checks/diff.ts`**

```ts
import type { ProbeRecord } from './probe.js';

export interface Difference {
  step: string;
  field: string;
  expected: unknown;
  actual: unknown;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const FIELDS = ['status', 'contentType', 'location', 'allow', 'body'] as const;

export function compareProbes(expected: ProbeRecord[], actual: ProbeRecord[]): Difference[] {
  const differences: Difference[] = [];
  const byName = new Map(actual.map((record) => [record.name, record]));
  for (const want of expected) {
    const got = byName.get(want.name);
    if (!got) {
      differences.push({ step: want.name, field: 'missing', expected: 'present', actual: 'absent' });
      continue;
    }
    for (const field of FIELDS) {
      if (stable(want[field]) !== stable(got[field])) differences.push({ step: want.name, field, expected: want[field], actual: got[field] });
    }
  }
  const expectedNames = new Set(expected.map((record) => record.name));
  for (const record of actual) {
    if (!expectedNames.has(record.name)) differences.push({ step: record.name, field: 'unexpected', expected: 'absent', actual: 'present' });
  }
  return differences;
}
```

- [ ] **Step 9: Run, typecheck, commit**

Run: `cd evaluator && npx vitest run test/log-check.test.ts test/probe.test.ts test/diff.test.ts && npm run typecheck`
Expected: PASS.

```bash
git add evaluator
git commit -m "feat(evaluator): log rules, behaviour probe with golden baseline, probe diff"
```

---

### Task 9: Contract, source and coverage checks; gate and server runners

**Files:**
- Create: `evaluator/checks/files.ts`, `evaluator/checks/contract-check.ts`, `evaluator/checks/source-scan.ts`, `evaluator/checks/coverage-check.ts`, `evaluator/checks/gates.ts`, `evaluator/checks/server-process.ts`
- Test: `evaluator/test/static-checks.test.ts`, `evaluator/test/gates.test.ts`, `evaluator/test/server-process.test.ts`

**Interfaces:**
- Produces:
  - `listFiles(dir: string): string[]` (sorted posix relative paths; skips `node_modules`, `dist`, `coverage`)
  - `checkContract(workDir: string, canonicalPath: string): { ok: boolean; problem?: string }`
  - `scanSources(workDir: string): { ok: boolean; findings: string[] }`
  - `checkCoverage(workDir: string): { ok: boolean; totals: Record<string, number> | null; problems: string[] }`
  - `runGate(name, command, cwd, logDir, options?: { timeoutMs?: number; env?: Record<string, string> }): Promise<GateResult>`, with `GateResult = { name: string; command: string; ok: boolean; exitCode: number | null; durationMs: number; log: string }`
  - `startServer({ command, args, cwd, port }): Promise<{ url: string; stop(): Promise<string> }>`

- [ ] **Step 1: Write the failing test `evaluator/test/static-checks.test.ts`** (Review Focus 3)

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkContract } from '../checks/contract-check.js';
import { checkCoverage } from '../checks/coverage-check.js';
import { scanSources } from '../checks/source-scan.js';

function tree(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'sw-static-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

describe('checkContract', () => {
  const canonical = join(tree({ 'openapi.yaml': 'a: 1\n' }), 'openapi.yaml');

  it('passes an identical copy and fails an edited or missing one', () => {
    expect(checkContract(tree({ 'contract/openapi.yaml': 'a: 1\n' }), canonical)).toEqual({ ok: true });
    expect(checkContract(tree({ 'contract/openapi.yaml': 'a: 2\n' }), canonical).ok).toBe(false);
    expect(checkContract(tree({}), canonical)).toEqual({ ok: false, problem: 'contract/openapi.yaml is missing' });
  });
});

describe('scanSources', () => {
  it('passes clean sources and allows console in loggers and tests', () => {
    const dir = tree({
      'backend/src/app.ts': 'export const x = 1;\n',
      'backend/src/logger.ts': 'console.log("x");\n',
      'frontend/src/App.test.tsx': 'vi.spyOn(console, "info"); console.info("t");\n',
    });
    expect(scanSources(dir)).toEqual({ ok: true, findings: [] });
  });

  it('finds suppressions, skipped tests and stray console use', () => {
    const dir = tree({
      'backend/src/app.ts': '// eslint-disable-next-line\nconsole.log("hi");\n',
      'backend/test/a.test.ts': 'it.skip("x", () => {});\n/* v8 ignore next */\n',
      'frontend/src/x.ts': '// @ts-ignore\n',
      'backend/node_modules/pkg/index.js': '// eslint-disable\n',
    });
    expect(scanSources(dir).findings).toEqual([
      'backend/src/app.ts:1: eslint-disable comment',
      'backend/src/app.ts:2: console use outside the logger',
      'backend/test/a.test.ts:1: skipped or focused test',
      'backend/test/a.test.ts:2: coverage ignore comment',
      'frontend/src/x.ts:1: TypeScript suppression',
    ]);
  });
});

describe('checkCoverage', () => {
  function withSummary(pct: number, files: string[]): string {
    const dir = tree({ 'backend/src/app.ts': 'x', 'backend/src/server.ts': 'x', 'backend/src/domain/asset.ts': 'x' });
    const metric = { pct };
    const summary: Record<string, unknown> = { total: { lines: metric, branches: metric, functions: metric, statements: metric } };
    for (const file of files) summary[join(dir, file)] = { lines: metric };
    mkdirSync(join(dir, 'backend/coverage'), { recursive: true });
    writeFileSync(join(dir, 'backend/coverage/coverage-summary.json'), JSON.stringify(summary));
    return dir;
  }

  it('passes 100% with every source file reported (server.ts excused)', () => {
    expect(checkCoverage(withSummary(100, ['backend/src/app.ts', 'backend/src/domain/asset.ts'])).ok).toBe(true);
  });

  it('fails below 100% and when a source file is missing from the report', () => {
    const result = checkCoverage(withSummary(92, ['backend/src/app.ts']));
    expect(result.problems).toEqual([
      'lines coverage is 92%',
      'branches coverage is 92%',
      'functions coverage is 92%',
      'statements coverage is 92%',
      'backend/src/domain/asset.ts is not in the coverage report',
    ]);
  });

  it('fails when there is no report', () => {
    expect(checkCoverage(tree({})).problems).toEqual(['backend/coverage/coverage-summary.json not found']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd evaluator && npx vitest run test/static-checks.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write `evaluator/checks/files.ts`**

```ts
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SKIP = new Set(['node_modules', 'dist', 'coverage', '.git']);

export function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(relative(dir, full).split(sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}
```

- [ ] **Step 4: Write `evaluator/checks/contract-check.ts`**

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function checkContract(workDir: string, canonicalPath: string): { ok: boolean; problem?: string } {
  const copy = join(workDir, 'contract/openapi.yaml');
  if (!existsSync(copy)) return { ok: false, problem: 'contract/openapi.yaml is missing' };
  if (!readFileSync(copy).equals(readFileSync(canonicalPath))) return { ok: false, problem: 'contract/openapi.yaml differs from the pinned contract' };
  return { ok: true };
}
```

- [ ] **Step 5: Write `evaluator/checks/source-scan.ts`**

```ts
// Enforces instructions.md ground rules 3 and 7 independently of the build's own lint config.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listFiles } from './files.js';

const ROOTS = ['backend/src', 'backend/test', 'frontend/src', 'contract', 'scripts'];
const SOURCE = /\.(ts|tsx|js|mjs|cjs)$/;
const LOGGERS = new Set(['backend/src/logger.ts', 'frontend/src/logger.ts']);
const FORBIDDEN: Array<[RegExp, string]> = [
  [/eslint-disable/, 'eslint-disable comment'],
  [/@ts-ignore|@ts-expect-error/, 'TypeScript suppression'],
  [/\b(?:it|test|describe)\.(?:skip|only|todo)\b/, 'skipped or focused test'],
  [/\b(?:istanbul|v8|c8) ignore\b/, 'coverage ignore comment'],
];

function isTestFile(path: string): boolean {
  return /\.test\.[cm]?[tj]sx?$/.test(path) || path.startsWith('backend/test/') || path.startsWith('frontend/src/test/');
}

export function scanSources(workDir: string): { ok: boolean; findings: string[] } {
  const findings: string[] = [];
  for (const root of ROOTS) {
    const dir = join(workDir, root);
    if (!existsSync(dir)) continue;
    for (const relative of listFiles(dir)) {
      if (!SOURCE.test(relative)) continue;
      const path = `${root}/${relative}`;
      const appSource = (root === 'backend/src' || root === 'frontend/src') && !isTestFile(path) && !LOGGERS.has(path);
      readFileSync(join(dir, relative), 'utf8').split('\n').forEach((line, index) => {
        for (const [pattern, label] of FORBIDDEN) if (pattern.test(line)) findings.push(`${path}:${index + 1}: ${label}`);
        if (appSource && /\bconsole\./.test(line)) findings.push(`${path}:${index + 1}: console use outside the logger`);
      });
    }
  }
  return { ok: findings.length === 0, findings };
}
```

- [ ] **Step 6: Write `evaluator/checks/coverage-check.ts`**

```ts
// Reads the coverage report itself, so a loosened config cannot hide gaps (instructions.md §4.5, §6.1).
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { listFiles } from './files.js';

const METRICS = ['lines', 'branches', 'functions', 'statements'];

export function checkCoverage(workDir: string): { ok: boolean; totals: Record<string, number> | null; problems: string[] } {
  const file = join(workDir, 'backend/coverage/coverage-summary.json');
  if (!existsSync(file)) return { ok: false, totals: null, problems: ['backend/coverage/coverage-summary.json not found'] };
  const summary = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, { pct: number }>>;
  const totals = Object.fromEntries(METRICS.map((metric) => [metric, summary.total?.[metric]?.pct ?? 0]));
  const problems = METRICS.filter((metric) => (totals[metric] ?? 0) < 100).map((metric) => `${metric} coverage is ${totals[metric]}%`);
  const reported = new Set(Object.keys(summary).filter((key) => key !== 'total').map((key) => relative(workDir, key).split(sep).join('/')));
  const sourceDir = join(workDir, 'backend/src');
  const expected = existsSync(sourceDir)
    ? listFiles(sourceDir).filter((path) => path.endsWith('.ts') && path !== 'server.ts').map((path) => `backend/src/${path}`)
    : [];
  for (const path of expected) if (!reported.has(path)) problems.push(`${path} is not in the coverage report`);
  return { ok: problems.length === 0, totals, problems };
}
```

- [ ] **Step 7: Run static checks**

Run: `cd evaluator && npx vitest run test/static-checks.test.ts`
Expected: PASS.

- [ ] **Step 8: Write the failing tests `evaluator/test/gates.test.ts` and `evaluator/test/server-process.test.ts`**

```ts
// evaluator/test/gates.test.ts
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runGate } from '../checks/gates.js';

describe('runGate', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sw-gate-'));

  it('records a passing command and its output', async () => {
    expect(await runGate('pass', 'echo hello', dir, dir)).toMatchObject({ name: 'pass', ok: true, exitCode: 0, log: 'logs/pass.log' });
    expect(readFileSync(join(dir, 'pass.log'), 'utf8')).toContain('hello');
  });

  it('records a failing command', async () => {
    expect(await runGate('fail', 'echo nope >&2; exit 3', dir, dir)).toMatchObject({ ok: false, exitCode: 3 });
    expect(readFileSync(join(dir, 'fail.log'), 'utf8')).toContain('nope');
  });

  it('passes extra environment variables', async () => {
    await runGate('env', 'echo "$SW_TEST"', dir, dir, { env: { SW_TEST: 'yes' } });
    expect(readFileSync(join(dir, 'env.log'), 'utf8')).toContain('yes');
  });

  it('kills a command that exceeds its timeout', async () => {
    expect((await runGate('slow', 'sleep 5', dir, dir, { timeoutMs: 200 })).ok).toBe(false);
  });
});
```

```ts
// evaluator/test/server-process.test.ts
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { startServer } from '../checks/server-process.js';

const evaluatorDir = fileURLToPath(new URL('..', import.meta.url));

describe('startServer', () => {
  it('waits for /ping and returns captured output on stop', async () => {
    const server = await startServer({ command: process.execPath, args: ['--import', 'tsx', 'oracle/golden-server.ts'], cwd: evaluatorDir, port: 4190 });
    await fetch(`${server.url}/assets`);
    const output = await server.stop();
    expect(output.split('\n').filter((line) => line.includes('http_response'))).toHaveLength(2);
  });

  it('fails clearly when the server exits early', async () => {
    await expect(startServer({ command: process.execPath, args: ['-e', 'process.exit(4)'], cwd: evaluatorDir, port: 4191 })).rejects.toThrow(/exited early/);
  });
});
```

- [ ] **Step 9: Write `evaluator/checks/gates.ts`**

```ts
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface GateResult {
  name: string;
  command: string;
  ok: boolean;
  exitCode: number | null;
  durationMs: number;
  log: string;
}

export function runGate(
  name: string,
  command: string,
  cwd: string,
  logDir: string,
  options: { timeoutMs?: number; env?: Record<string, string> } = {},
): Promise<GateResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', command], { cwd, env: { ...process.env, ...options.env }, detached: true });
    let output = `$ ${command}\n`;
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    const timer = setTimeout(() => {
      output += `\n[killed after ${options.timeoutMs} ms]\n`;
      if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL');
    }, options.timeoutMs ?? 20 * 60_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      writeFileSync(join(logDir, `${name}.log`), output);
      resolve({ name, command, ok: code === 0, exitCode: code, durationMs: Date.now() - started, log: `logs/${name}.log` });
    });
  });
}
```

- [ ] **Step 10: Write `evaluator/checks/server-process.ts`**

```ts
import { spawn } from 'node:child_process';

export interface RunningServer {
  url: string;
  stop(): Promise<string>;
}

export async function startServer(options: { command: string; args: string[]; cwd: string; port: number }): Promise<RunningServer> {
  const child = spawn(options.command, options.args, { cwd: options.cwd, env: { ...process.env, PORT: String(options.port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
  const exited = new Promise<void>((resolve) => child.on('exit', () => resolve()));
  const url = `http://127.0.0.1:${options.port}`;
  const output = (): string => [stdout, stderr].filter((part) => part.length > 0).join('\n');
  const deadline = Date.now() + 20_000;

  for (;;) {
    if (child.exitCode !== null) throw new Error(`Server exited early with code ${child.exitCode}:\n${output()}`);
    try {
      if ((await fetch(`${url}/ping`)).ok) break;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) {
      child.kill('SIGKILL');
      throw new Error(`Server did not answer /ping within 20 s:\n${output()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return {
    url,
    async stop() {
      child.kill('SIGTERM');
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      return output();
    },
  };
}
```

- [ ] **Step 11: Run, typecheck, commit**

Run: `cd evaluator && npx vitest run test/static-checks.test.ts test/gates.test.ts test/server-process.test.ts && npm run typecheck`
Expected: PASS.

```bash
git add evaluator
git commit -m "feat(evaluator): contract, source-scan and coverage checks; gate and server runners"
```

---

### Task 10: Run checks, scorer agent, Docker images, run scripts

**Files:**
- Create: `evaluator/checks/run-checks.ts`, `evaluator/scorer/scorer-prompt.md`, `evaluator/docker/builder.Dockerfile`, `evaluator/docker/scorer.Dockerfile`, `evaluator/docker/scorer.Dockerfile.dockerignore`, `evaluator/build-images.sh`, `evaluator/score-run.sh`, `evaluator/run.sh`

**Interfaces:**
- Consumes: all of Tasks 7–9.
- Produces:
  - `checks.json` with this shape (`Checks`, exported from `run-checks.ts`):
    `{ generatedAt: string; contract: { ok: boolean; problem?: string }; manifests: ManifestResult; sourceScan: { ok: boolean; findings: string[] }; gates: GateResult[]; coverage: { ok: boolean; totals: Record<string, number> | null; problems: string[] }; oracle: GateResult; logs: { acceptance: LogCheckResult; probe: LogCheckResult } | null; probe: boolean; buildReport: boolean; commits: number; problems: string[] }`
  - `scorecard.md`, written by the scorer agent and ending with a line `Recommendation: SHIP|FIX FIRST|REJECT`.

- [ ] **Step 1: Write `evaluator/checks/run-checks.ts`**

```ts
// Usage (inside evaluator-scorer, cwd /eval/evaluator): tsx checks/run-checks.ts <workDir> <outDir>
// Deterministic facts about one build. No verdicts.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkContract } from './contract-check.js';
import { checkCoverage } from './coverage-check.js';
import { runGate, type GateResult } from './gates.js';
import { checkLogs, type LogCheckResult } from './log-check.js';
import { checkManifests, type ManifestResult } from './manifest-check.js';
import { PROBE_STEPS, runProbe } from './probe.js';
import { startServer } from './server-process.js';
import { scanSources } from './source-scan.js';

export interface Checks {
  generatedAt: string;
  contract: { ok: boolean; problem?: string };
  manifests: ManifestResult;
  sourceScan: { ok: boolean; findings: string[] };
  gates: GateResult[];
  coverage: { ok: boolean; totals: Record<string, number> | null; problems: string[] };
  oracle: GateResult;
  logs: { acceptance: LogCheckResult; probe: LogCheckResult } | null;
  probe: boolean;
  buildReport: boolean;
  commits: number;
  problems: string[];
}

// Script names come from instructions.md §6.2.
const GATES: Array<[string, string]> = [
  ['install', 'npm ci --ignore-scripts'],
  ['typecheck', 'npm run typecheck'],
  ['lint', 'npm run lint'],
  ['contract-validate', 'npm run contract:validate'],
  ['contract-tests', 'npm run test:contract'],
  ['backend-coverage', 'npm run test:coverage -w backend'],
  ['frontend-tests', 'npm run test -w frontend'],
  ['frontend-build', 'npm run build -w frontend'],
  ['smoke', 'npm run smoke'],
  ['audit', 'npm audit --audit-level=high'],
];

function countCommits(workDir: string): number {
  const result = spawnSync('git', ['rev-list', '--count', 'HEAD'], { cwd: workDir, encoding: 'utf8' });
  return result.status === 0 ? Number(result.stdout.trim()) : 0;
}

async function main(): Promise<void> {
  const [workArg, outArg] = process.argv.slice(2);
  if (!workArg || !outArg) throw new Error('usage: run-checks.ts <workDir> <outDir>');
  const workDir = resolve(workArg);
  const outDir = resolve(outArg);
  const logDir = join(outDir, 'logs');
  mkdirSync(logDir, { recursive: true });
  const evaluatorDir = fileURLToPath(new URL('..', import.meta.url));
  const problems: string[] = [];

  const instructionsPath = join(workDir, 'instructions.md');
  let manifests: ManifestResult = { ok: false, problems: ['instructions.md missing from the run'] };
  if (existsSync(instructionsPath)) {
    try {
      manifests = checkManifests(workDir, readFileSync(instructionsPath, 'utf8'));
    } catch (err) {
      manifests = { ok: false, problems: [err instanceof Error ? err.message : String(err)] };
    }
  }

  const gates: GateResult[] = [];
  for (const [name, command] of GATES) gates.push(await runGate(name, command, workDir, logDir));

  const oracleCommand = 'npx vitest run --config oracle/acceptance/vitest.config.ts';
  let oracle: GateResult = { name: 'acceptance', command: oracleCommand, ok: false, exitCode: null, durationMs: 0, log: 'backend/dist/server.js missing' };
  let logs: Checks['logs'] = null;
  let probe = false;

  if (existsSync(join(workDir, 'backend/dist/server.js'))) {
    try {
      const forAcceptance = await startServer({ command: 'node', args: ['backend/dist/server.js'], cwd: workDir, port: 4100 });
      oracle = await runGate('acceptance', oracleCommand, evaluatorDir, logDir, { env: { BASE_URL: forAcceptance.url } });
      const acceptanceOutput = await forAcceptance.stop();
      writeFileSync(join(logDir, 'server-acceptance.log'), acceptanceOutput);

      const forProbe = await startServer({ command: 'node', args: ['backend/dist/server.js'], cwd: workDir, port: 4101 });
      const records = await runProbe(forProbe.url);
      const probeOutput = await forProbe.stop();
      writeFileSync(join(logDir, 'server-probe.log'), probeOutput);
      writeFileSync(join(outDir, 'probe.json'), `${JSON.stringify(records, null, 2)}\n`);
      probe = true;

      // +1 for the readiness /ping made by startServer
      logs = { acceptance: checkLogs(acceptanceOutput), probe: checkLogs(probeOutput, { expectedResponses: PROBE_STEPS.length + 1 }) };
    } catch (err) {
      problems.push(`server: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const checks: Checks = {
    generatedAt: new Date().toISOString(),
    contract: checkContract(workDir, join(evaluatorDir, '../shelfwright/contract/openapi.yaml')),
    manifests,
    sourceScan: scanSources(workDir),
    gates,
    coverage: checkCoverage(workDir),
    oracle,
    logs,
    probe,
    buildReport: existsSync(join(workDir, 'BUILD_REPORT.md')),
    commits: countCommits(workDir),
    problems,
  };
  writeFileSync(join(outDir, 'checks.json'), `${JSON.stringify(checks, null, 2)}\n`);
}

await main();
```

- [ ] **Step 2: Write `evaluator/scorer/scorer-prompt.md`**

```markdown
You are an independent reviewer. Another agent built the codebase in the current directory by
following `instructions.md` (also in this directory). You did not build it, and you have no access
to how it was built. Assess the result on its own merits.

Inputs:
- The current directory: the build, read-only. `instructions.md` is the brief the builder was given.
- `/out/checks.json` and `/out/logs/`: automated check results. Treat them as facts. Never contradict
  them, and never mark something as working that a check shows failing.

Do not modify the build. Your only output is the file `/out/scorecard.md`.

Score each rubric item 1–5 (5 = exemplary, 3 = acceptable, 1 = unacceptable). Every score needs at
least one piece of evidence as `path:line` or a check name from `checks.json`.

1. **Test-first evidence**: do tests drive the design? Look at git history (`git log --stat`), and check that tests exercise behaviour rather than mirroring implementation.
2. **Test quality**: meaningful assertions, edge cases, no tautologies, contract helper used as `instructions.md` requires.
3. **Contract and decisions fidelity**: behaviour, status codes, headers, error shapes and UI text match `instructions.md` §4 and the contract, including anything the automated checks do not cover.
4. **Security**: input handling, error leakage, logging of sensitive data, dependency hygiene, anything you would block in review.
5. **Clarity and structure**: matches the §5 layout, small focused modules, honest names, no dead code.
6. **Instruction adherence and report honesty**: does `BUILD_REPORT.md` match reality (`checks.json`, git history)? Are "Unspecified decisions" reasonable and complete?

Write `/out/scorecard.md` in exactly this shape:

# Scorecard

| # | Item | Score | Evidence |
|---|---|---|---|
| 1 | Test-first evidence | n | … |
| 2 | Test quality | n | … |
| 3 | Contract and decisions fidelity | n | … |
| 4 | Security | n | … |
| 5 | Clarity and structure | n | … |
| 6 | Instruction adherence and report honesty | n | … |

## Findings

One bullet per finding: `severity (blocker/major/minor) · path:line · problem · suggested fix`.

## Summary

Two or three sentences.

Recommendation: SHIP | FIX FIRST | REJECT

(The last line must be exactly one of `Recommendation: SHIP`, `Recommendation: FIX FIRST` or
`Recommendation: REJECT`. A person makes the final decision; your recommendation is advice.)
```

- [ ] **Step 3: Write the Docker files**

`evaluator/docker/builder.Dockerfile`:

```dockerfile
# Sandbox for one Shelfwright build: Node 24, git and the Claude Code CLI. Nothing from evaluator/.
FROM node:24-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g @anthropic-ai/claude-code@2.1.286
USER node
WORKDIR /work
```

`evaluator/docker/scorer.Dockerfile` (build context: repo root):

```dockerfile
# Runs deterministic checks and the scorer agent against one build. Holds the hidden oracle.
FROM node:24-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && git config --system --add safe.directory '*'
RUN npm install -g @anthropic-ai/claude-code@2.1.286
WORKDIR /eval/evaluator
COPY evaluator/package.json evaluator/package-lock.json ./
RUN npm ci --ignore-scripts
COPY evaluator/ ./
COPY shelfwright/contract/openapi.yaml /eval/shelfwright/contract/openapi.yaml
RUN chown -R node:node /eval
USER node
```

`evaluator/docker/scorer.Dockerfile.dockerignore`:

```
*
!evaluator/
!shelfwright/contract/
evaluator/node_modules
evaluator/rounds
```

- [ ] **Step 4: Write `evaluator/build-images.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
EVAL="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$EVAL/.." && pwd)"
docker build -q -f "$EVAL/docker/builder.Dockerfile" -t shelfwright-builder "$EVAL/docker" >/dev/null
docker build -q -f "$EVAL/docker/scorer.Dockerfile" -t evaluator-scorer "$ROOT" >/dev/null
echo "Built shelfwright-builder and evaluator-scorer."
```

- [ ] **Step 5: Write `evaluator/score-run.sh`**

```bash
#!/usr/bin/env bash
# Usage: evaluator/score-run.sh <run-dir>   (re-runnable)
# 1) deterministic checks (build mounted read-write: install, build, test)
# 2) scorer agent: a separate session, build mounted READ-ONLY, builder transcript NOT mounted
set -euo pipefail
RUN_DIR="$(cd "${1:?usage: score-run.sh <run-dir>}" && pwd)"
SCORER_MODEL="${EVALUATOR_SCORER_MODEL:-claude-opus-5-5}"
mkdir -p "$RUN_DIR/score"

docker run --rm \
  -v "$RUN_DIR/repo:/work" \
  -v "$RUN_DIR/score:/out" \
  evaluator-scorer npx tsx checks/run-checks.ts /work /out \
  || echo "run-checks exited non-zero; see $RUN_DIR/score" >&2

docker run --rm \
  -e ANTHROPIC_API_KEY -e CLAUDE_CODE_OAUTH_TOKEN \
  -v "$RUN_DIR/repo:/work:ro" \
  -v "$RUN_DIR/score:/out" \
  -w /work \
  evaluator-scorer \
  timeout 1800 claude -p "$(cat "$(dirname "$0")/scorer/scorer-prompt.md")" \
    --model "$SCORER_MODEL" --dangerously-skip-permissions --output-format stream-json --verbose \
  > "$RUN_DIR/score/scorer-transcript.jsonl" 2> "$RUN_DIR/score/scorer-stderr.log" \
  || echo "scorer agent exited non-zero; see $RUN_DIR/score/scorer-stderr.log" >&2
```

- [ ] **Step 6: Verify the scorer's isolation** (Review Focus 5)

Run:
```bash
cd evaluator && ./build-images.sh && D=$(mktemp -d) && mkdir -p "$D/repo" "$D/score" && touch "$D/transcript.jsonl" \
  && docker run --rm -v "$D/repo:/work:ro" -v "$D/score:/out" -w /work evaluator-scorer \
     sh -c 'touch /work/x 2>/dev/null && echo WRITABLE || echo READ-ONLY; ls / /work | grep -c transcript || true'
```
Expected: `READ-ONLY` and `0` (no transcript visible).

- [ ] **Step 7: Write `evaluator/run.sh`**

```bash
#!/usr/bin/env bash
# Usage: evaluator/run.sh <round> [runs=3]
# Env: ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN (required)
#      SHELFWRIGHT_BUILDER_MODEL (default claude-sonnet-5-5)
#      EVALUATOR_SCORER_MODEL   (default claude-opus-5-5)
#      SHELFWRIGHT_TIMEOUT_SECONDS (default 5400)
set -euo pipefail
ROUND="${1:?usage: run.sh <round> [runs]}"
RUNS="${2:-3}"
EVAL="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$EVAL/.." && pwd)"
BUILDER_MODEL="${SHELFWRIGHT_BUILDER_MODEL:-claude-sonnet-5-5}"
SCORER_MODEL="${EVALUATOR_SCORER_MODEL:-claude-opus-5-5}"
TIMEOUT="${SHELFWRIGHT_TIMEOUT_SECONDS:-5400}"
PROMPT="Your working directory contains instructions.md. Read all of it, then follow it exactly to build the project in this directory. Work autonomously until every phase is complete or the instructions tell you to stop."

if [[ -z "${ANTHROPIC_API_KEY:-}" && -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]]; then
  echo "Set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN (claude setup-token)." >&2
  exit 2
fi
if [[ "$BUILDER_MODEL" == "$SCORER_MODEL" ]]; then
  echo "Note: builder and scorer use the same model ($BUILDER_MODEL). They are still separate sessions." >&2
fi
(cd "$ROOT/shelfwright" && npm run --silent check) || { echo "instructions.md is stale: run npm run assemble in shelfwright/" >&2; exit 2; }

ROUND_DIR="$EVAL/rounds/$ROUND"
mkdir -p "$ROUND_DIR"
shasum -a 256 "$ROOT/instructions.md" | cut -d' ' -f1 > "$ROUND_DIR/instructions.sha256"
printf 'builder=%s\nscorer=%s\n' "$BUILDER_MODEL" "$SCORER_MODEL" > "$ROUND_DIR/models.txt"
"$EVAL/build-images.sh"

for i in $(seq 1 "$RUNS"); do
  RUN_DIR="$ROUND_DIR/run-$i"
  if [[ -e "$RUN_DIR" ]]; then echo "$RUN_DIR exists; use a new round number" >&2; exit 2; fi
  mkdir -p "$RUN_DIR/repo"
  cp "$ROOT/instructions.md" "$RUN_DIR/repo/instructions.md"
  echo "[round $ROUND] run $i/$RUNS: building ($BUILDER_MODEL)"
  set +e
  docker run --rm --name "shelfwright-r$ROUND-$i" \
    -e ANTHROPIC_API_KEY -e CLAUDE_CODE_OAUTH_TOKEN \
    -v "$RUN_DIR/repo:/work" \
    shelfwright-builder \
    timeout "$TIMEOUT" claude -p "$PROMPT" --model "$BUILDER_MODEL" --dangerously-skip-permissions \
      --output-format stream-json --verbose \
    > "$RUN_DIR/transcript.jsonl" 2> "$RUN_DIR/builder-stderr.log"
  echo $? > "$RUN_DIR/builder-exit-code"
  set -e
  echo "[round $ROUND] run $i/$RUNS: checks + scorer agent ($SCORER_MODEL)"
  EVALUATOR_SCORER_MODEL="$SCORER_MODEL" "$EVAL/score-run.sh" "$RUN_DIR"
done

(cd "$EVAL" && npx tsx report/diff-runs.ts "$ROUND_DIR")
(cd "$EVAL" && npx tsx report/review.ts "$ROUND_DIR")
echo "Examiner review: $ROUND_DIR/review.md"
```

Run: `chmod +x evaluator/*.sh`

- [ ] **Step 8: Typecheck, full tests, commit**

Run: `cd evaluator && npm run typecheck && npm test`
Expected: exit 0; all PASS.

```bash
git add evaluator
git commit -m "feat(evaluator): run-checks, independent scorer agent, sandbox images, run scripts"
```

---

### Task 11: Round diff, examiner review, judge, docs

**Files:**
- Create: `evaluator/report/diff-runs.ts`, `evaluator/report/review.ts`, `evaluator/judge/judge-prompt.md`, `evaluator/judge/judge.sh`, `evaluator/README.md`, `evaluator/CHANGELOG.md`
- Test: `evaluator/test/review.test.ts`

**Interfaces:**
- Consumes: `Checks` (Task 10), `compareProbes`, `normaliseRecords`, `oracle/golden-probe.json`.
- Produces:
  - `listRuns(roundDir: string): string[]`
  - `diffRound(roundDir: string, golden: ProbeRecord[]): RoundDiff`, with `RoundDiff = { ok: boolean; runs: Array<{ run: string; ok: boolean; differences: Difference[]; note?: string }> }`
  - `renderReview(roundDir: string): string`
  - `writeReview(roundDir: string, options?: { force?: boolean }): string`

- [ ] **Step 1: Write the failing test `evaluator/test/review.test.ts`** (Review Focus 4)

```ts
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProbeRecord } from '../checks/probe.js';
import { diffRound } from '../report/diff-runs.js';
import { renderReview, writeReview } from '../report/review.js';

const golden: ProbeRecord[] = [
  { name: 'ping', method: 'GET', path: '/ping', status: 200, contentType: 'application/json', location: null, allow: null, body: { status: 'ok' } },
];

const gate = (name: string, ok: boolean) => ({ name, command: name, ok, exitCode: ok ? 0 : 1, durationMs: 1, log: `logs/${name}.log` });

function checks(ok: boolean) {
  return {
    generatedAt: '2026-10-15T00:00:00.000Z',
    contract: ok ? { ok: true } : { ok: false, problem: 'contract/openapi.yaml differs from the pinned contract' },
    manifests: { ok: true, problems: [] },
    sourceScan: ok ? { ok: true, findings: [] } : { ok: false, findings: ['backend/test/a.test.ts:3: skipped or focused test'] },
    gates: [gate('install', true), gate('backend-coverage', ok)],
    coverage: ok ? { ok: true, totals: { branches: 100 }, problems: [] } : { ok: false, totals: { branches: 92 }, problems: ['branches coverage is 92%'] },
    oracle: gate('acceptance', ok),
    logs: { acceptance: { ok: true, responseLines: 10, errorLines: 0, problems: [] }, probe: { ok: true, responseLines: 29, errorLines: 0, problems: [] } },
    probe: true,
    buildReport: true,
    commits: 30,
    problems: [],
  };
}

function makeRound(): string {
  const round = mkdtempSync(join(tmpdir(), 'sw-round-'));
  for (const [run, ok, status] of [['run-1', true, 200], ['run-2', false, 500]] as const) {
    mkdirSync(join(round, run, 'score'), { recursive: true });
    writeFileSync(join(round, run, 'builder-exit-code'), '0\n');
    writeFileSync(join(round, run, 'score/checks.json'), JSON.stringify(checks(ok)));
    writeFileSync(join(round, run, 'score/probe.json'), JSON.stringify([{ ...golden[0], status }]));
  }
  writeFileSync(join(round, 'run-1', 'score/scorecard.md'), '# Scorecard\n\nRecommendation: SHIP\n');
  mkdirSync(join(round, 'run-3', 'score'), { recursive: true });
  writeFileSync(join(round, 'run-3', 'builder-exit-code'), '124\n');
  return round;
}

describe('diffRound', () => {
  it('compares every run against the golden baseline', () => {
    const result = diffRound(makeRound(), golden);
    expect(result.ok).toBe(false);
    expect(result.runs.map((run) => [run.run, run.ok])).toEqual([['run-1', true], ['run-2', false], ['run-3', false]]);
    expect(result.runs[1]?.differences[0]).toMatchObject({ step: 'ping', field: 'status', expected: 200, actual: 500 });
    expect(result.runs[2]?.note).toMatch(/no probe/);
  });
});

describe('review', () => {
  it('summarises each run and leaves the verdict to the examiner', () => {
    const round = makeRound();
    writeFileSync(join(round, 'diff.json'), JSON.stringify(diffRound(round, golden)));
    const review = renderReview(round);
    expect(review).toContain('| run-1 | 0 | PASS | PASS | PASS | 2/2 | PASS | PASS | PASS | PASS | SHIP |');
    expect(review).toContain('| run-2 | 0 | FAIL | PASS | FAIL | 1/2 | FAIL | FAIL | PASS | FAIL | missing |');
    expect(review).toContain('| run-3 | 124 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | FAIL | missing |');
    expect(review).toContain('backend/test/a.test.ts:3: skipped or focused test');
    expect(review).toContain('**Verdict (PASS / FAIL):**');
    expect(review.match(/### Examiner checklist/g)).toHaveLength(3);
  });

  it('never overwrites a review the examiner may have filled in', () => {
    const round = makeRound();
    writeFileSync(join(round, 'review.md'), 'examiner notes');
    expect(() => writeReview(round)).toThrow(/already exists/);
    expect(readFileSync(join(round, 'review.md'), 'utf8')).toBe('examiner notes');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd evaluator && npx vitest run test/review.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write `evaluator/report/diff-runs.ts`**

```ts
// Usage: tsx report/diff-runs.ts <round-dir>
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compareProbes, type Difference } from '../checks/diff.js';
import { normaliseRecords, type ProbeRecord } from '../checks/probe.js';

export interface RoundDiff {
  ok: boolean;
  runs: Array<{ run: string; ok: boolean; differences: Difference[]; note?: string }>;
}

export function listRuns(roundDir: string): string[] {
  return readdirSync(roundDir).filter((name) => /^run-\d+$/.test(name)).sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)));
}

export function diffRound(roundDir: string, golden: ProbeRecord[]): RoundDiff {
  const expected = normaliseRecords(golden);
  const runs = listRuns(roundDir).map((run) => {
    const file = join(roundDir, run, 'score/probe.json');
    if (!existsSync(file)) return { run, ok: false, differences: [], note: 'no probe (server did not build or start)' };
    const differences = compareProbes(expected, normaliseRecords(JSON.parse(readFileSync(file, 'utf8')) as ProbeRecord[]));
    return { run, ok: differences.length === 0, differences };
  });
  return { ok: runs.length > 0 && runs.every((run) => run.ok), runs };
}

function toMarkdown(result: RoundDiff): string {
  const lines = ['# Behaviour vs golden baseline', '', `Overall: **${result.ok ? 'IDENTICAL' : 'DIFFERENCES FOUND'}**`, ''];
  for (const run of result.runs) {
    lines.push(`## ${run.run}: ${run.ok ? 'matches golden' : 'differs'}`, '');
    if (run.note) lines.push(run.note, '');
    for (const diff of run.differences) {
      lines.push(`- \`${diff.step}\` ${diff.field}: expected \`${JSON.stringify(diff.expected)}\`, got \`${JSON.stringify(diff.actual)}\``);
    }
    lines.push('');
  }
  return lines.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const roundDir = resolve(process.argv[2] ?? '');
  const golden = JSON.parse(readFileSync(fileURLToPath(new URL('../oracle/golden-probe.json', import.meta.url)), 'utf8')) as ProbeRecord[];
  const result = diffRound(roundDir, golden);
  writeFileSync(join(roundDir, 'diff.json'), `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(join(roundDir, 'diff.md'), toMarkdown(result));
}
```

- [ ] **Step 4: Write `evaluator/report/review.ts`**

```ts
// Usage: tsx report/review.ts <round-dir> [--force]
// Automated results are facts, the scorer agent's recommendation is advice, the examiner decides.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Checks } from '../checks/run-checks.js';
import { listRuns, type RoundDiff } from './diff-runs.js';

function readJson<T>(file: string): T | null {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : null;
}

const mark = (ok: boolean | undefined): string => (ok === undefined ? 'n/a' : ok ? 'PASS' : 'FAIL');

const CHECKLIST = [
  '- [ ] The app works: I can register a book, see field errors, and filter the list (`npm run dev -w backend` + `npm run dev -w frontend` in the run repo, open http://localhost:5173).',
  '- [ ] No code I would refuse to ship: security smells, dead code, hacks, misleading names.',
  "- [ ] Tests are honest and were written first; the agent's contract tests really check the contract.",
  '- [ ] Logging follows §4.3: only `http_response` and `error`, nothing sensitive.',
  '- [ ] `BUILD_REPORT.md` is truthful; its "Unspecified decisions" are acceptable.',
  "- [ ] I agree or disagree with the scorer agent's recommendation, and say why.",
];

export function renderReview(roundDir: string): string {
  const round = roundDir.split('/').filter(Boolean).pop();
  const diff = readJson<RoundDiff>(join(roundDir, 'diff.json'));
  const read = (file: string) => (existsSync(join(roundDir, file)) ? readFileSync(join(roundDir, file), 'utf8').trim() : 'unknown');
  const lines = [
    `# Round ${round}: examiner review`,
    '',
    `instructions.md sha256: \`${read('instructions.sha256')}\``,
    `Models: ${read('models.txt').replace(/\n/g, ', ')}`,
    `Judge findings: ${existsSync(join(roundDir, 'judge.md')) ? '[judge.md](judge.md)' : 'not run'}`,
    `Behaviour vs golden: **${diff ? (diff.ok ? 'all runs identical' : 'differences found') : 'not computed'}** ([diff.md](diff.md))`,
    '',
    'Automated results are facts. The scorer agent gives advice. **Your verdict is final.**',
    '',
    '| Run | Builder exit | Contract | Manifests | Source scan | Gates | Coverage | Acceptance | Logs | Behaviour | Scorer agent |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  const sections: string[] = [];
  for (const run of listRuns(roundDir)) {
    const dir = join(roundDir, run);
    const exit = existsSync(join(dir, 'builder-exit-code')) ? readFileSync(join(dir, 'builder-exit-code'), 'utf8').trim() : '?';
    const checks = readJson<Checks>(join(dir, 'score/checks.json'));
    const scorecardFile = join(dir, 'score/scorecard.md');
    const recommendation = existsSync(scorecardFile)
      ? (/^Recommendation:\s*(SHIP|FIX FIRST|REJECT)\s*$/m.exec(readFileSync(scorecardFile, 'utf8'))?.[1] ?? 'unreadable')
      : 'missing';
    const behaviour = diff?.runs.find((entry) => entry.run === run);
    if (!checks) {
      lines.push(`| ${run} | ${exit} | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ${mark(behaviour?.ok)} | ${recommendation} |`);
    } else {
      const passed = checks.gates.filter((gate) => gate.ok).length;
      const logsOk = checks.logs ? checks.logs.acceptance.ok && checks.logs.probe.ok : false;
      lines.push(
        `| ${run} | ${exit} | ${mark(checks.contract.ok)} | ${mark(checks.manifests.ok)} | ${mark(checks.sourceScan.ok)} | ${passed}/${checks.gates.length} | ${mark(checks.coverage.ok)} | ${mark(checks.oracle.ok)} | ${mark(logsOk)} | ${mark(behaviour?.ok)} | ${recommendation} |`,
      );
    }
    sections.push(`## ${run}`, '');
    sections.push(`- Repo: [${run}/repo](${run}/repo) · Builder transcript: [${run}/transcript.jsonl](${run}/transcript.jsonl) · Build report: [${run}/repo/BUILD_REPORT.md](${run}/repo/BUILD_REPORT.md) · Scorecard: [${run}/score/scorecard.md](${run}/score/scorecard.md)`);
    if (checks) {
      const findings = [
        ...(checks.contract.problem ? [checks.contract.problem] : []),
        ...checks.manifests.problems,
        ...checks.sourceScan.findings,
        ...checks.gates.filter((gate) => !gate.ok).map((gate) => `gate ${gate.name} failed: ${run}/score/${gate.log}`),
        ...checks.coverage.problems,
        ...(checks.oracle.ok ? [] : [`acceptance failed: ${run}/score/${checks.oracle.log}`]),
        ...(checks.logs?.acceptance.problems ?? []),
        ...(checks.logs?.probe.problems ?? []),
        ...checks.problems,
      ];
      for (const finding of findings) sections.push(`- ${finding}`);
      sections.push(`- Commits: ${checks.commits} · BUILD_REPORT.md present: ${checks.buildReport ? 'yes' : 'no'}`);
    } else {
      sections.push('- No checks.json: the checks did not run or crashed.');
    }
    if (behaviour && !behaviour.ok) sections.push(`- Behaviour differs from golden in ${behaviour.differences.length} place(s)${behaviour.note ? ` (${behaviour.note})` : ''}; see diff.md`);
    sections.push('', '### Examiner checklist', '', ...CHECKLIST, '', '**Verdict (PASS / FAIL):**', '', '**Notes:**', '', '');
  }
  lines.push(
    '',
    ...sections,
    '## Round verdict',
    '',
    '- [ ] Every run is PASS and behaviour matches golden → the round passes.',
    '',
    '**Changes to Shelfwright I approve** (record each in `evaluator/CHANGELOG.md` with the finding that caused it):',
    '',
  );
  return `${lines.join('\n')}\n`;
}

export function writeReview(roundDir: string, options: { force?: boolean } = {}): string {
  const file = join(roundDir, 'review.md');
  if (existsSync(file) && !options.force) throw new Error(`${file} already exists; it may hold examiner notes. Use --force to replace it.`);
  writeFileSync(file, renderReview(roundDir));
  return file;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  writeReview(resolve(process.argv[2] ?? ''), { force: process.argv.includes('--force') });
}
```

- [ ] **Step 5: Run the test**

Run: `cd evaluator && npx vitest run test/review.test.ts`
Expected: PASS. If only the column spacing differs, fix `renderReview` to match the pinned row format. Do not change the test.

- [ ] **Step 6: Write `evaluator/judge/judge-prompt.md`**

```markdown
You are reviewing build instructions that will be handed, unchanged, to an unknown coding agent
(any tool, any model) on an unknown machine. The agent cannot ask questions. The goal is that every
agent following the instructions builds services with identical external behaviour.

The instructions are provided on stdin. Do not use tools; read and reason only.

Find problems in these categories:
1. AMBIGUITY: a sentence two competent engineers could implement differently with visibly different behaviour.
2. CONTRADICTION: two places (including the contract vs the prose) that cannot both be followed.
3. UNPINNED BEHAVIOUR: externally visible behaviour (status codes, bodies, headers, UI text, logs) left to the agent.
4. TOOL ASSUMPTION: anything that only works in a particular agent product or environment.
5. UNSAFE INSTRUCTION: anything that could leak secrets, run untrusted code, or weaken security.
6. WEAK GATE: a gate command that could exit 0 while the phase's requirements are unmet.
7. INFEASIBLE: a step that cannot succeed as written (missing file, wrong path, impossible order, incompatible versions).

Output Markdown only:

| # | Severity (blocker/major/minor) | Category | Location (section heading) | Quote | Problem | Suggested fix |
|---|---|---|---|---|---|---|

After the table, one line: `Verdict: READY` or `Verdict: NOT READY (<n> blockers, <m> majors)`.
Report each problem once. Do not rewrite the document. Do not praise it.
```

- [ ] **Step 7: Write `evaluator/judge/judge.sh`**

```bash
#!/usr/bin/env bash
# Usage: evaluator/judge/judge.sh <round>   Writes evaluator/rounds/<round>/judge.md
set -euo pipefail
ROUND="${1:?usage: judge.sh <round>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$ROOT/evaluator/rounds/$ROUND"
mkdir -p "$OUT"
claude -p "$(cat "$HERE/judge-prompt.md")" --model "${EVALUATOR_JUDGE_MODEL:-claude-opus-5-5}" \
  < "$ROOT/instructions.md" > "$OUT/judge.md"
echo "Judge findings: $OUT/judge.md"
```

Run: `chmod +x evaluator/judge/judge.sh`

- [ ] **Step 8: Write `evaluator/CHANGELOG.md`**

```markdown
# Shelfwright changelog

Every change to Shelfwright (`shelfwright/`, and therefore `instructions.md`) after round 1, with the
finding that caused it and the examiner's approval.

| Date | Round | Finding (source) | Change | Approved by |
|---|---|---|---|---|
```

- [ ] **Step 9: Write `evaluator/README.md`**

```markdown
# Evaluator

Assesses builds produced by Shelfwright (`../instructions.md`). It lives above the agent and the
app; nothing here is ever visible to a builder.

## Design rules

1. **No hidden requirements.** Every check traces to a sentence in `instructions.md`. Manifest checks read the run's own copy.
2. **A run cannot pass by editing its own checks.** The acceptance suite and golden baseline never ship in a build. Every gate is re-run here. Coverage is read from the report, the contract is hash-compared, and source is scanned for suppressions.
3. **A different agent scores.** The scorer agent is a separate session, by default on a different model from the builder. It sees the build read-only and never sees the builder transcript.
4. **Facts, advice, verdict.** `checks.json` is fact. `scorecard.md` is the scorer agent's advice. The examiner's `review.md` verdict is final.
5. **Docker isolates evaluation.** Builders run in `shelfwright-builder`. Checks and the scorer run in `evaluator-scorer`. Agent-written code never runs on the host.

## Prerequisites

- Docker Desktop running.
- `ANTHROPIC_API_KEY`, or `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`.
- `npm install --ignore-scripts` in `evaluator/` and `shelfwright/`.

## A round

1. `npm test && npm run preflight` here, and `npm test && npm run check` in `../shelfwright`.
2. `judge/judge.sh <round>`, then read `rounds/<round>/judge.md` and decide what to fix first.
3. `./run.sh <round> [runs=3]`. For each run:
   - the builder sandbox builds the app;
   - `run-checks` writes `checks.json`;
   - the scorer agent writes `scorecard.md`.
4. Open `rounds/<round>/review.md`. Work through each run and write your verdict.
5. Make the approved changes in `../shelfwright`, run `npm run assemble`, and log each one in `CHANGELOG.md`.
6. Done when one round of 3 runs is all PASS and matches golden.

## Checks

| Check | Traces to |
|---|---|
| Contract hash | instructions §7 Phase 1, Appendix A |
| Manifests (exact deps and scripts) | instructions §2 rule 4, §6.2, §6.3 |
| Source scan | instructions §2 rules 3 and 7 |
| Gates | instructions §6.2 scripts, Phase gates |
| Coverage (report, all files) | instructions §4.5, §6.1 |
| Acceptance suite | instructions §4 and the contract |
| Probe vs golden | instructions §4 and the contract |
| Log rules | instructions §4.3 |

Re-score a run with `./score-run.sh rounds/<round>/run-<i>`. Regenerate a review with
`npx tsx report/review.ts rounds/<round> --force`; this overwrites your notes.
```

- [ ] **Step 10: Full tests, typecheck, commit**

Run: `cd evaluator && npm run typecheck && npm test && cd ../shelfwright && npm test && npm run check`
Expected: all PASS.

```bash
git add evaluator
git commit -m "feat(evaluator): round diff vs golden, examiner review, judge, docs"
```

---

### Task 12: Smoke round (handoff to the Testing phase)

This task needs the examiner. It requires Docker running and an API key or OAuth token.

**Files:**
- Generated: `evaluator/rounds/1/**`

- [ ] **Step 1: Preconditions**

Run: `docker info >/dev/null && echo docker-ok; (cd evaluator && npm test && npm run preflight) && (cd shelfwright && npm test && npm run check)`
Expected: `docker-ok`, then all PASS. If Docker is down, ask the examiner to start Docker Desktop.

- [ ] **Step 2: Judge**

Run: `evaluator/judge/judge.sh 1`
Show the examiner `evaluator/rounds/1/judge.md`. **Stop and ask** which findings to fix before spending a run. Apply only the approved fixes in `shelfwright/`, run `npm run assemble`, and log each one in `evaluator/CHANGELOG.md`.

- [ ] **Step 3: One-run smoke round**

Run: `evaluator/run.sh 1 1` (expect 30–90 minutes).
Expected: `evaluator/rounds/1/review.md` exists, and the run has `checks.json` and `scorecard.md`.

- [ ] **Step 4: Examiner review**

Give the examiner `review.md` and summarise the automated facts and the scorer's recommendation in a few lines. Do **not** write a verdict. Record the examiner's verdict and approved changes once they are given.

- [ ] **Step 5: Commit round evidence**

```bash
git add evaluator/rounds/1 evaluator/CHANGELOG.md
git commit -m "eval: round 1 (smoke) results and examiner review"
```

The Testing phase (rounds of 3 until the exit criterion) and Finalising (the reference build in
`library-asset-service/`, the containerisation decision, the note for Nexus) each get their own plan
after this smoke round.

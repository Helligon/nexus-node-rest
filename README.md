# Library Asset Service

## Overview

A small service for tracking books in a library. A Node.js + TypeScript REST API registers and lists books (in memory), and a single React page registers books and lists them with filters.

## Requirements

- Node.js 24.x with npm 10 or 11
- git

## Quick start

```sh
npm ci --ignore-scripts
npm run dev -w backend      # API on http://localhost:3000
npm run dev -w frontend     # in another terminal
```

Then open http://localhost:5173. The frontend reaches the API through the `/api` Vite proxy.

## Configuration

| Variable | Used by | Default |
|---|---|---|
| `PORT` | backend | `3000` |
| `CORS_ORIGIN` | backend | `http://localhost:5173` |
| `VITE_API_URL` | frontend, at build time | `/api` |

## API

- `GET /ping`: liveness check, `{"status":"ok"}`.
- `POST /assets`: register a book (`201`, with a `Location` header).
- `GET /assets`: list books in creation order; filters `author`, `status`, `q`.
- `GET /assets/{id}`: fetch one book, or `404`.

The full contract is in `contract/openapi.yaml`.

## Testing

```sh
npm run verify
```

This runs the rule checks, type checks, lint, contract validation, unit, contract and frontend tests (backend coverage is 100%), the black-box conformance suite against the built server, the frontend build and a smoke test.

## Observability

Each log event is one JSON line.

- `http_response`: one per HTTP response (backend via `console.log`, frontend via `console.info`). It carries the method, path or URL without the query string, and the status.
- `error`: one per unexpected failure in code (`console.error`), with `name`, `message` and `stack`. Client (4xx) errors are not logged as errors.

## Decisions

All design decisions are recorded in section 4 of `instructions.md`.

## Not included

| Feature | Production approach |
|---|---|
| Persistent database | SQLite for small scale, PostgreSQL for larger deployments, implemented behind `AssetRepository`. |
| Bulk import | A CSV import of a large number of books through the API (for example `POST /assets/import` with `text/csv`), validated row by row with a per-row error report. |
| Authentication and authorisation | Required before any real deployment. |
| Deployment packaging | Containers and a deployment pipeline, decided separately. |

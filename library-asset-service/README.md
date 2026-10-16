# Library Asset Service

## Overview

A small service for tracking books in a library. The backend is a Node.js + TypeScript REST API (Express 5, Zod 4) that keeps data in memory. The frontend is one React page that registers books and lists them with filters.

## Requirements

- Node.js 24.x with npm 10 or 11
- git

## Quick start

```sh
npm ci --ignore-scripts
npm run dev -w backend
npm run dev -w frontend
```

Then open http://localhost:5173. The frontend reaches the backend through `/api`, which the Vite dev proxy forwards to port 3000.

## Configuration

| Variable | Used by | Default |
|---|---|---|
| `PORT` | backend | `3000` |
| `CORS_ORIGIN` | backend | `http://localhost:5173` |
| `VITE_API_URL` | frontend, at build time | `/api` |

## API

- `GET /ping`: liveness check, `{"status":"ok"}`.
- `POST /assets`: register a book; `201` with the asset and a `Location` header.
- `GET /assets`: list books in creation order, filtered by `author`, `status` and `q`.
- `GET /assets/{id}`: fetch one book, or `404`.

The full contract is in `contract/openapi.yaml`.

## Testing

```sh
npm run verify
```

This runs the rule check, type checks, lint, contract validation, unit and component tests (backend coverage is held at 100%), the black-box conformance suite against the built server, the frontend build and a smoke test.

## Observability

Two kinds of JSON log line, one object per line:

- `http_response`: one per HTTP response (method, path or url without query string, status; backend adds `durationMs`).
- `error`: one per unexpected failure in code (`name`, `message`, `stack`). Client mistakes (4xx) are not logged as errors.

## Decisions

The decisions log is in section 4 of `instructions.md`.

## Not included

| Feature | Production approach |
|---|---|
| Persistent database | SQLite for small scale, PostgreSQL for larger deployments, implemented behind `AssetRepository`. |
| Bulk import | A CSV import of a large number of books through the API (for example `POST /assets/import` with `text/csv`), validated row by row with a per-row error report. |
| Authentication and authorisation | Required before any real deployment. |
| Deployment packaging | Containers and a deployment pipeline, decided separately. |

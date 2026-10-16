# Library Asset Service: agent build instructions

A pre-interview exercise for Nexus. The deliverable is not the app itself. It is **`instructions.md`**, a file that any coding agent can follow to rebuild the same Library Asset Service. That service is a Node/Express REST API for registering and listing books, with a React page on top.

## Layout

| Path | What it is |
|---|---|
| [`instructions.md`](instructions.md) | **The deliverable.** Build instructions, the decisions log (§4) and the API contract (Appendix A). |
| [`library-asset-service/`](library-asset-service/) | Reference build, produced by an agent (Claude Sonnet) from `instructions.md` alone. Its git history is the agent's own. |
| [`shelfwright/`](shelfwright/) | Source for `instructions.md`: a template and `contract/openapi.yaml`, combined by `npm run assemble`. |
| [`evaluator/`](evaluator/) | Harness used to test the instructions. It runs fresh agents in Docker, then checks each build against a hidden acceptance suite and a reference server, and has a separate agent score it. Evidence from the final rounds is in `evaluator/evidence/`. |
| [`docs/`](docs/) | Design spec and implementation plan. |

## Running the reference build

```sh
cd library-asset-service
npm ci --ignore-scripts
npm run dev -w backend    # API on http://localhost:3000
npm run dev -w frontend   # page on http://localhost:5173
npm run verify            # every check and test
```

Requires Node.js 24.

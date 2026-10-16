import { randomUUID } from 'node:crypto';
import { createApp } from './app.js';
import { consoleLogger } from './logger.js';
import { InMemoryAssetRepository } from './repo/asset-repository.js';

const port = Number(process.env.PORT ?? 3000);
const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173';

const fail = (err: unknown) => {
  consoleLogger.error(err);
  process.exit(1);
};

process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);

const app = createApp({
  repo: new InMemoryAssetRepository(),
  logger: consoleLogger,
  clock: () => new Date(),
  idGen: randomUUID,
  corsOrigin,
});

const server = app.listen(port);
server.on('error', fail);

const shutdown = () => {
  server.close();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

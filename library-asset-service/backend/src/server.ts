import { randomUUID } from 'node:crypto';
import { createApp } from './app.js';
import { consoleLogger } from './logger.js';
import { InMemoryAssetRepository } from './repo/asset-repository.js';

const fail = (err: unknown): void => {
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
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
});

const server = app.listen(Number(process.env.PORT ?? 3000));
server.on('error', fail);

const shutdown = (): void => {
  server.close();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

import type { Express } from 'express';
import { createApp, type AppDeps } from '../../src/app.js';
import type { HttpResponseLog, Logger } from '../../src/logger.js';
import { InMemoryAssetRepository, type AssetRepository } from '../../src/repo/asset-repository.js';

export interface TestLogs extends Logger {
  responses: HttpResponseLog[];
  errors: unknown[];
}

export function makeTestApp(overrides: Partial<AppDeps> = {}): { app: Express; repo: AssetRepository; logs: TestLogs } {
  const logs: TestLogs = {
    responses: [],
    errors: [],
    httpResponse(entry) {
      this.responses.push(entry);
    },
    error(err) {
      this.errors.push(err);
    },
  };
  let counter = 0;
  const repo = overrides.repo ?? new InMemoryAssetRepository();
  const app = createApp({
    repo,
    logger: logs,
    clock: () => new Date('2026-01-01T00:00:00.000Z'),
    idGen: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
    corsOrigin: 'http://localhost:5173',
    ...overrides,
  });
  return { app, repo, logs };
}


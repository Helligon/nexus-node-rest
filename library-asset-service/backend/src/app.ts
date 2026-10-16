import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import type { Logger } from './logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFound } from './middleware/not-found.js';
import { requestLog } from './middleware/request-log.js';
import type { AssetRepository } from './repo/asset-repository.js';
import { assetsRouter } from './routes/assets.js';
import { pingRouter } from './routes/ping.js';

export interface AppDeps { repo: AssetRepository; logger: Logger; clock: () => Date; idGen: () => string; corsOrigin: string }

export function createApp(deps: AppDeps): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestLog(deps.logger));
  app.use(helmet());
  app.use(cors({ origin: deps.corsOrigin }));
  app.use(pingRouter());
  app.use(assetsRouter(deps));
  app.use(notFound);
  app.use(errorHandler(deps.logger));
  return app;
}

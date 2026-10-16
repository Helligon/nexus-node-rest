import type { RequestHandler } from 'express';
import type { Logger } from '../logger.js';

export function requestLog(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      logger.httpResponse({
        method: req.method,
        path: req.originalUrl.split('?')[0] as string,
        status: res.statusCode,
        durationMs: Number(process.hrtime.bigint() - start) / 1e6,
      });
    });
    next();
  };
}

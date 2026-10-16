import type { RequestHandler } from 'express';
import type { Logger } from '../logger.js';

export function requestLog(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const start = performance.now();
    res.on('finish', () => {
      logger.httpResponse({
        method: req.method,
        path: req.originalUrl.split('?')[0] as string,
        status: res.statusCode,
        durationMs: Math.round((performance.now() - start) * 10) / 10,
      });
    });
    next();
  };
}

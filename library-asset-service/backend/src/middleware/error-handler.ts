import type { ErrorRequestHandler } from 'express';
import { HttpError, httpError } from '../errors.js';
import type { Logger } from '../logger.js';

function toHttpError(err: unknown, logger: Logger): HttpError {
  if (err instanceof HttpError) return err;
  const { type, status, expose } = (err ?? {}) as { type?: unknown; status?: unknown; expose?: unknown };
  if (type === 'entity.too.large') return httpError('PAYLOAD_TOO_LARGE');
  if (type === 'encoding.unsupported' || type === 'charset.unsupported') return httpError('UNSUPPORTED_MEDIA_TYPE');
  if (type === 'entity.parse.failed') return httpError('VALIDATION_ERROR', [{ field: 'body', issue: 'must be valid JSON' }]);
  if (err instanceof URIError) return httpError('NOT_FOUND');
  if (typeof status === 'number' && status >= 400 && status <= 499 && expose === true) {
    return httpError('VALIDATION_ERROR', [{ field: 'body', issue: 'could not be read' }]);
  }
  logger.error(err);
  return httpError('INTERNAL_ERROR');
}

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, _req, res, _next) => {
    const { status, code, message, details } = toHttpError(err, logger);
    res.status(status).json({ error: { code, message, ...(details && { details }) } });
  };
}

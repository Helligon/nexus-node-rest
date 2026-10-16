import type { ErrorRequestHandler } from 'express';
import { HttpError, validationError } from '../errors.js';
import type { Logger } from '../logger.js';

interface HttpLikeError { status?: unknown; expose?: unknown; type?: unknown }

function body(code: string, message: string, details?: unknown) {
  return { error: { code, message, ...(details ? { details } : {}) } };
}

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, _req, res, _next) => {
    const e = err as HttpLikeError;
    if (err instanceof HttpError) {
      res.status(err.status).json(body(err.code, err.message, err.details));
    } else if (e.type === 'entity.too.large') {
      res.status(413).json(body('PAYLOAD_TOO_LARGE', 'Request body must be 10 kb or smaller'));
    } else if (e.type === 'encoding.unsupported' || e.type === 'charset.unsupported') {
      res.status(415).json(body('UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json'));
    } else if (e.type === 'entity.parse.failed') {
      const v = validationError([{ field: 'body', issue: 'must be valid JSON' }]);
      res.status(v.status).json(body(v.code, v.message, v.details));
    } else if (err instanceof URIError) {
      res.status(404).json(body('NOT_FOUND', 'Resource not found'));
    } else if (typeof e.status === 'number' && e.status >= 400 && e.status <= 499 && e.expose === true) {
      const v = validationError([{ field: 'body', issue: 'could not be read' }]);
      res.status(v.status).json(body(v.code, v.message, v.details));
    } else {
      logger.error(err);
      res.status(500).json(body('INTERNAL_ERROR', 'Internal server error'));
    }
  };
}

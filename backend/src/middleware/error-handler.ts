import type { ErrorRequestHandler } from 'express';
import type { FieldIssue } from '../domain/asset.js';
import { HttpError } from '../errors.js';
import type { ErrorCode } from '../errors.js';
import type { Logger } from '../logger.js';

interface Mapped { status: number; code: ErrorCode; message: string; details?: FieldIssue[] }

const bodyIssue = (issue: string): FieldIssue[] => [{ field: 'body', issue }];

function map(err: unknown, logger: Logger): Mapped {
  if (err instanceof HttpError) {
    return { status: err.status, code: err.code, message: err.message, details: err.details };
  }
  const { type, status, expose } = (err ?? {}) as { type?: unknown; status?: unknown; expose?: unknown };
  if (type === 'entity.too.large') {
    return { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Request body must be 10 kb or smaller' };
  }
  if (type === 'encoding.unsupported' || type === 'charset.unsupported') {
    return { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Content-Type must be application/json' };
  }
  if (type === 'entity.parse.failed') {
    return { status: 400, code: 'VALIDATION_ERROR', message: 'Request is invalid', details: bodyIssue('must be valid JSON') };
  }
  if (err instanceof URIError) {
    return { status: 404, code: 'NOT_FOUND', message: 'Resource not found' };
  }
  if (typeof status === 'number' && status >= 400 && status <= 499 && expose === true) {
    return { status: 400, code: 'VALIDATION_ERROR', message: 'Request is invalid', details: bodyIssue('could not be read') };
  }
  logger.error(err);
  return { status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' };
}

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, _req, res, _next) => {
    const { status, code, message, details } = map(err, logger);
    res.status(status).json({ error: { code, message, ...(details && { details }) } });
  };
}

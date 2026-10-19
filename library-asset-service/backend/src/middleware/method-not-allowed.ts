import type { RequestHandler } from 'express';
import { httpError } from '../errors.js';

export function methodNotAllowed(allow: string): RequestHandler {
  return (_req, res, next) => {
    res.set('Allow', allow);
    next(httpError('METHOD_NOT_ALLOWED'));
  };
}

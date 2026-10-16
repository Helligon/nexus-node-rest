import type { RequestHandler } from 'express';
import { HttpError } from '../errors.js';

export function methodNotAllowed(allow: string): RequestHandler {
  return (_req, res, next) => {
    res.set('Allow', allow);
    next(new HttpError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed'));
  };
}

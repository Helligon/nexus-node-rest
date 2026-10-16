import type { RequestHandler } from 'express';
import { HttpError } from '../errors.js';

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new HttpError(404, 'NOT_FOUND', 'Resource not found'));
};

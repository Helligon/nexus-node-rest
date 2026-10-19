import type { RequestHandler } from 'express';
import { httpError } from '../errors.js';

export const notFound: RequestHandler = (_req, _res, next) => {
  next(httpError('NOT_FOUND'));
};

import type { RequestHandler } from 'express';
import { notFound as notFoundError } from '../errors.js';

export const notFound: RequestHandler = (_req, _res, next) => {
  next(notFoundError());
};

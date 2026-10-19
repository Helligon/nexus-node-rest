import type { RequestHandler } from 'express';
import { httpError } from '../errors.js';

export const requireJson: RequestHandler = (req, _res, next) => {
  const mediaType = (req.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') {
    next(httpError('UNSUPPORTED_MEDIA_TYPE'));
    return;
  }
  next();
};

import type { RequestHandler } from 'express';
import { HttpError } from '../errors.js';

export const requireJson: RequestHandler = (req, _res, next) => {
  const mediaType = (req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
  if (mediaType !== 'application/json') {
    next(new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json'));
    return;
  }
  next();
};

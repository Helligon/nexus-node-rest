import { Router } from 'express';
import { methodNotAllowed } from '../middleware/method-not-allowed.js';

export function pingRouter(): Router {
  const router = Router();
  router
    .route('/ping')
    .get((_req, res) => {
      res.json({ status: 'ok' });
    })
    .all(methodNotAllowed('GET'));
  return router;
}

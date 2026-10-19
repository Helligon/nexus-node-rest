import express, { Router } from 'express';
import { parseAssetFilter, parseNewAsset } from '../domain/asset.js';
import type { Asset } from '../domain/asset.js';
import { httpError } from '../errors.js';
import { methodNotAllowed } from '../middleware/method-not-allowed.js';
import { requireJson } from '../middleware/require-json.js';
import type { AssetRepository } from '../repo/asset-repository.js';

export interface AssetRouteDeps { repo: AssetRepository; clock: () => Date; idGen: () => string }

export function assetsRouter({ repo, clock, idGen }: AssetRouteDeps): Router {
  const router = Router();

  router
    .route('/assets')
    .post(requireJson, express.json({ limit: '10kb' }), async (req, res) => {
      const parsed = parseNewAsset(req.body);
      if (!parsed.ok) throw httpError('VALIDATION_ERROR', parsed.issues);
      const { isbn } = parsed.value;
      if (isbn !== null && (await repo.findByIsbn(isbn))) throw httpError('CONFLICT');
      const asset: Asset = { id: idGen(), ...parsed.value, createdAt: clock().toISOString() };
      await repo.add(asset);
      res.status(201).location(`/assets/${asset.id}`).json(asset);
    })
    .get(async (req, res) => {
      const parsed = parseAssetFilter(new URLSearchParams(req.originalUrl.split('?')[1] ?? ''));
      if (!parsed.ok) throw httpError('VALIDATION_ERROR', parsed.issues);
      res.json({ data: await repo.list(parsed.value) });
    })
    .all(methodNotAllowed('GET, POST'));

  router
    .route('/assets/:id')
    .get(async (req, res) => {
      const asset = await repo.findById(req.params.id);
      if (!asset) throw httpError('NOT_FOUND');
      res.json(asset);
    })
    .all(methodNotAllowed('GET'));

  return router;
}

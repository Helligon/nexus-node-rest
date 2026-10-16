import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { assertMatchesContract, assertMatchesSchema } from '../../../contract/contract-helper.js';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { InMemoryAssetRepository } from '../../src/repo/asset-repository.js';
import { makeTestApp } from '../support/test-app.js';

describe('platform behaviour', () => {
  it('returns 404 for unknown routes', async () => {
    const { app } = makeTestApp();
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    assertMatchesSchema('Error', res.body);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
  });

  it('returns a generic 500 and logs exactly one error when the repository throws', async () => {
    const repo = new InMemoryAssetRepository();
    const boom = new Error('secret internals');
    repo.list = async () => {
      throw boom;
    };
    const { app, logs } = makeTestApp({ repo });
    const res = await request(app).get('/assets');
    expect(res.status).toBe(500);
    assertMatchesContract('GET', '/assets', 500, res.body);
    expect(res.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    expect(JSON.stringify(res.body)).not.toContain('secret');
    expect(logs.errors).toEqual([boom]);
  });

  it('logs exactly one response per request, without the query string', async () => {
    const { app, logs } = makeTestApp();
    await request(app).get('/assets?q=secret');
    await request(app).get('/nope');
    expect(logs.responses).toHaveLength(2);
    expect(logs.responses[0]).toMatchObject({ method: 'GET', path: '/assets', status: 200 });
    expect(logs.responses[0]!.durationMs).toBeGreaterThanOrEqual(0);
    expect(logs.responses[1]).toMatchObject({ path: '/nope', status: 404 });
    expect(logs.errors).toEqual([]);
  });

  it('sets security headers and CORS, and hides X-Powered-By', async () => {
    const { app } = makeTestApp();
    const res = await request(app).get('/ping');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('answers a CORS preflight with 204 on any path', async () => {
    const { app } = makeTestApp();
    for (const path of ['/assets', '/ping', '/nope']) {
      const res = await request(app)
        .options(path)
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'POST');
      expect(res.status).toBe(204);
      expect(res.text).toBe('');
    }
  });

  it('maps an unexposed-status read error to 400 "could not be read" without logging', async () => {
    const { logs } = makeTestApp();
    const app = express();
    app.use((_req, _res, next) => {
      next(Object.assign(new Error('aborted'), { status: 400, expose: true, type: 'request.aborted' }));
    });
    app.use(errorHandler(logs));
    const res = await request(app).get('/');
    expect(res.status).toBe(400);
    assertMatchesSchema('Error', res.body);
    expect(res.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Request is invalid', details: [{ field: 'body', issue: 'could not be read' }] },
    });
    expect(logs.errors).toEqual([]);
  });

  it('treats a 4xx error without expose as unexpected', async () => {
    const { logs } = makeTestApp();
    const app = express();
    app.use((_req, _res, next) => next(Object.assign(new Error('x'), { status: 400 })));
    app.use(errorHandler(logs));
    const res = await request(app).get('/');
    expect(res.status).toBe(500);
    expect(logs.errors).toHaveLength(1);
  });
});

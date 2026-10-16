import express from 'express';
import type { Request, Response } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { assertMatchesContract, assertMatchesSchema } from '../../../contract/contract-helper.js';
import { errorHandler } from '../../src/middleware/error-handler.js';
import type { AssetRepository } from '../../src/repo/asset-repository.js';
import { makeTestApp } from '../support/test-app.js';

describe('platform behaviour', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(makeTestApp().app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({ code: 'NOT_FOUND', message: 'Resource not found' });
    assertMatchesSchema('Error', res.body);
  });

  it('returns a generic 500 and logs one error when the repository throws', async () => {
    const boom = new Error('secret internals');
    const repo: AssetRepository = {
      add: async () => { throw boom; },
      findById: async () => { throw boom; },
      findByIsbn: async () => { throw boom; },
      list: async () => { throw boom; },
    };
    const { app, logs } = makeTestApp({ repo });
    const res = await request(app).get('/assets');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    expect(JSON.stringify(res.body)).not.toContain('secret');
    assertMatchesContract('GET', '/assets', 500, res.body);
    expect(logs.errors).toEqual([boom]);
  });

  it('logs one response per request without the query string', async () => {
    const { app, logs } = makeTestApp();
    await request(app).get('/assets?q=secret');
    await request(app).get('/nope');
    expect(logs.responses).toHaveLength(2);
    expect(logs.responses[0]).toMatchObject({ method: 'GET', path: '/assets', status: 200 });
    expect(logs.responses[0]!.durationMs).toBeGreaterThanOrEqual(0);
    expect(logs.responses[1]).toMatchObject({ path: '/nope', status: 404 });
    expect(logs.errors).toEqual([]);
  });

  it('sets security and CORS headers and answers preflight', async () => {
    const { app } = makeTestApp();
    const res = await request(app).get('/ping').set('Origin', 'http://localhost:5173');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const pre = await request(app)
      .options('/assets')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST');
    expect(pre.status).toBe(204);
    expect(pre.text).toBe('');
  });

  it('maps a client error from body parsing to could not be read without logging', async () => {
    const { logs } = makeTestApp();
    const app = express();
    app.use((_req, _res, next) => {
      next(Object.assign(new Error('aborted'), { status: 400, expose: true, type: 'request.aborted' }));
    });
    app.use(errorHandler(logs));
    const res = await request(app).get('/');
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Request is invalid',
      details: [{ field: 'body', issue: 'could not be read' }],
    });
    assertMatchesSchema('Error', res.body);
    expect(logs.errors).toEqual([]);
  });

  it('treats thrown non-Error values as internal errors', async () => {
    const { logs } = makeTestApp();
    const app = express();
    app.get('/', () => {
      throw 'oops';
    });
    app.use(errorHandler(logs));
    const res = await request(app).get('/');
    expect(res.status).toBe(500);
    expect(logs.errors).toEqual(['oops']);
  });

  it('copes with a nullish error value', () => {
    const { logs } = makeTestApp();
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    errorHandler(logs)(null, {} as Request, res as unknown as Response, () => {});
    expect(res.status).toHaveBeenCalledWith(500);
    expect(logs.errors).toEqual([null]);
  });
});

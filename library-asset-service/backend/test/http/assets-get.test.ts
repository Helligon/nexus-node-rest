import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { assertMatchesContract, assertMatchesSchema } from '../../../contract/contract-helper.js';
import { makeTestApp } from '../support/test-app.js';

const books = [
  { title: 'Dune', author: 'Frank Herbert', status: 'available' },
  { title: 'Emma', author: 'Jane Austen', status: 'lost' },
  { title: 'Dune Messiah', author: 'frank herbert', status: 'lost' },
];

async function seeded() {
  const t = makeTestApp();
  for (const b of books) await request(t.app).post('/assets').send(b).expect(201);
  return t;
}

describe('GET /ping', () => {
  it('returns ok', async () => {
    const { app } = makeTestApp();
    const res = await request(app).get('/ping');
    expect(res.status).toBe(200);
    assertMatchesContract('GET', '/ping', 200, res.body);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('answers POST with 405 and Allow: GET', async () => {
    const { app } = makeTestApp();
    const res = await request(app).post('/ping');
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe('GET');
    assertMatchesSchema('Error', res.body);
  });
});

describe('GET /assets/:id', () => {
  it('returns the asset', async () => {
    const { app } = await seeded();
    const id = '00000000-0000-4000-8000-000000000002';
    const res = await request(app).get(`/assets/${id}`);
    expect(res.status).toBe(200);
    assertMatchesContract('GET', '/assets/{id}', 200, res.body);
    expect(res.body.title).toBe('Emma');
  });

  it('returns 404 for unknown and non-UUID ids', async () => {
    const { app } = makeTestApp();
    for (const id of ['00000000-0000-4000-8000-0000000000ff', 'nope']) {
      const res = await request(app).get(`/assets/${id}`);
      expect(res.status).toBe(404);
      assertMatchesContract('GET', '/assets/{id}', 404, res.body);
      expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
    }
  });

  it('returns 404 for malformed percent-encoding without logging an error', async () => {
    const { app, logs } = makeTestApp();
    const res = await request(app).get('/assets/%E0%A4%A');
    expect(res.status).toBe(404);
    assertMatchesContract('GET', '/assets/{id}', 404, res.body);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(logs.errors).toEqual([]);
  });

  it('answers PUT with 405 and Allow: GET', async () => {
    const { app } = makeTestApp();
    const res = await request(app).put('/assets/x');
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe('GET');
    assertMatchesSchema('Error', res.body);
  });
});

describe('GET /assets', () => {
  const titles = async (app: Parameters<typeof request>[0], qs: string) => {
    const res = await request(app).get(`/assets${qs}`);
    expect(res.status).toBe(200);
    assertMatchesContract('GET', '/assets', 200, res.body);
    return res.body.data.map((a: { title: string }) => a.title);
  };

  it('lists everything in creation order', async () => {
    const { app } = await seeded();
    expect(await titles(app, '')).toEqual(['Dune', 'Emma', 'Dune Messiah']);
    expect(await titles(makeTestApp().app, '')).toEqual([]);
  });

  it('applies each filter and combinations', async () => {
    const { app } = await seeded();
    expect(await titles(app, '?author=%20FRANK%20HERBERT')).toEqual(['Dune', 'Dune Messiah']);
    expect(await titles(app, '?status=lost')).toEqual(['Emma', 'Dune Messiah']);
    expect(await titles(app, '?q=dune')).toEqual(['Dune', 'Dune Messiah']);
    expect(await titles(app, '?q=dune&status=lost&author=frank%20herbert')).toEqual(['Dune Messiah']);
  });

  it('rejects an invalid query', async () => {
    const { app } = makeTestApp();
    const res = await request(app).get('/assets?foo=1&status=x&status=y&q=');
    expect(res.status).toBe(400);
    assertMatchesContract('GET', '/assets', 400, res.body);
    expect(res.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request is invalid',
        details: [
          { field: 'status', issue: 'must be given once' },
          { field: 'q', issue: 'must be 1-200 characters' },
          { field: 'foo', issue: 'is not a supported filter' },
        ],
      },
    });
  });
});

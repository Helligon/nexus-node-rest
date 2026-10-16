import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { assertMatchesContract, assertMatchesSchema } from '../../../contract/contract-helper.js';
import { makeTestApp } from '../support/test-app.js';

const ID1 = '00000000-0000-4000-8000-000000000001';

async function seeded() {
  const t = makeTestApp();
  const post = (b: object) => request(t.app).post('/assets').send(b);
  await post({ title: 'War and Peace', author: 'Leo Tolstoy', status: 'on_loan' });
  await post({ title: 'Anna Karenina', author: 'Leo Tolstoy' });
  await post({ title: 'Dune', author: 'Frank Herbert', status: 'lost' });
  return t;
}

describe('GET /assets/:id', () => {
  it('returns the asset', async () => {
    const { app } = await seeded();
    const res = await request(app).get(`/assets/${ID1}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('War and Peace');
    assertMatchesContract('GET', '/assets/{id}', 200, res.body);
  });

  it('returns 404 for unknown ids', async () => {
    const { app, logs } = await seeded();
    for (const id of ['nope', '00000000-0000-4000-8000-0000000000ff', '%E0%A4%A']) {
      const res = await request(app).get(`/assets/${id}`);
      expect(res.status).toBe(404);
      expect(res.body.error).toEqual({ code: 'NOT_FOUND', message: 'Resource not found' });
      assertMatchesContract('GET', '/assets/{id}', 404, res.body);
    }
    expect(logs.errors).toEqual([]);
  });

  it('rejects PUT with 405', async () => {
    const res = await request(makeTestApp().app).put(`/assets/${ID1}`);
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe('GET');
    assertMatchesSchema('Error', res.body);
  });
});

describe('GET /assets', () => {
  const titles = async (qs: string) => {
    const { app } = await seeded();
    const res = await request(app).get(`/assets${qs}`);
    expect(res.status).toBe(200);
    assertMatchesContract('GET', '/assets', 200, res.body);
    return res.body.data.map((a: { title: string }) => a.title);
  };

  it('lists in creation order', async () => {
    expect(await titles('')).toEqual(['War and Peace', 'Anna Karenina', 'Dune']);
  });

  it('applies each filter and combinations', async () => {
    expect(await titles('?author=leo%20TOLSTOY')).toEqual(['War and Peace', 'Anna Karenina']);
    expect(await titles('?status=lost')).toEqual(['Dune']);
    expect(await titles('?q=ANNA')).toEqual(['Anna Karenina']);
    expect(await titles('?author=Leo%20Tolstoy&status=on_loan&q=war')).toEqual(['War and Peace']);
    expect(await titles('?q=zzz')).toEqual([]);
  });

  it('rejects an invalid query', async () => {
    const { app, logs } = await seeded();
    const res = await request(app).get('/assets?zz=1&5=x&status=bad');
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      { field: 'status', issue: 'must be one of available, on_loan, lost' },
      { field: 'zz', issue: 'is not a supported filter' },
      { field: '5', issue: 'is not a supported filter' },
    ]);
    assertMatchesContract('GET', '/assets', 400, res.body);
    expect(logs.errors).toEqual([]);
  });

  it('rejects DELETE with 405', async () => {
    const res = await request(makeTestApp().app).delete('/assets');
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe('GET, POST');
  });
});

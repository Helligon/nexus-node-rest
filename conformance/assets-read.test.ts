import { describe, expect, it } from 'vitest';
import { assertMatchesContract, assertMatchesSchema } from '../contract/contract-helper.js';
import { call, postJson, unique } from './support.js';

const list = async (qs: string) => {
  const res = await call('GET', `/assets${qs}`);
  expect(res.status).toBe(200);
  assertMatchesContract('GET', '/assets', 200, res.json);
  return res.json.data as { title: string; author: string; status: string; id: string }[];
};

describe('GET /assets', () => {
  const author = unique('Filter Author');
  const tag = unique('tag');
  const titles = [`${tag} Alpha`, `${tag} Beta`, `${tag} Gamma`];

  it('seeds books', async () => {
    await postJson({ title: titles[0], author, status: 'available' });
    await postJson({ title: titles[1], author: author.toUpperCase(), status: 'lost' });
    await postJson({ title: titles[2], author: 'Someone Else', status: 'lost' });
  });

  it('lists in creation order wrapped in data', async () => {
    const all = await list('');
    const mine = all.filter((a) => a.title.startsWith(tag)).map((a) => a.title);
    expect(mine).toEqual(titles);
  });

  it('filters by q (case-insensitive substring, trimmed)', async () => {
    expect((await list(`?q=${encodeURIComponent(` ${tag.toUpperCase()} `)}`)).map((a) => a.title)).toEqual(titles);
    expect((await list(`?q=${encodeURIComponent(`${tag} bet`)}`)).map((a) => a.title)).toEqual([titles[1]]);
  });

  it('filters by author (case-insensitive exact)', async () => {
    const got = await list(`?author=${encodeURIComponent(` ${author.toLowerCase()} `)}`);
    expect(got.map((a) => a.title)).toEqual([titles[0], titles[1]]);
    expect(await list(`?author=${encodeURIComponent(author.slice(0, 5))}`)).toEqual([]);
  });

  it('filters by status and combines filters with AND', async () => {
    expect((await list(`?status=lost&q=${encodeURIComponent(tag)}`)).map((a) => a.title)).toEqual([titles[1], titles[2]]);
    const got = await list(`?status=lost&q=${encodeURIComponent(tag)}&author=${encodeURIComponent(author)}`);
    expect(got.map((a) => a.title)).toEqual([titles[1]]);
  });

  it('rejects unknown, repeated, blank and over-long parameters in order', async () => {
    const res = await call('GET', `/assets?zz=1&5=x&q=%20&status=gone&author=${'a'.repeat(101)}&=x`);
    expect(res.status).toBe(400);
    assertMatchesContract('GET', '/assets', 400, res.json);
    expect(res.json.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Request is invalid',
      details: [
        { field: 'author', issue: 'must be 1-100 characters' },
        { field: 'status', issue: 'must be one of available, on_loan, lost' },
        { field: 'q', issue: 'must be 1-200 characters' },
        { field: 'zz', issue: 'is not a supported filter' },
        { field: '5', issue: 'is not a supported filter' },
        { field: 'query', issue: 'is not a supported filter' },
      ],
    });
  });

  it('rejects repeated parameters and an empty status', async () => {
    const a = await call('GET', '/assets?author=a&author=b&q=x&q=y');
    expect(a.json.error.details).toEqual([
      { field: 'author', issue: 'must be given once' },
      { field: 'q', issue: 'must be given once' },
    ]);
    const b = await call('GET', '/assets?status=');
    expect(b.json.error.details).toEqual([{ field: 'status', issue: 'must be one of available, on_loan, lost' }]);
    const c = await call('GET', `/assets?q=${'q'.repeat(201)}`);
    expect(c.json.error.details).toEqual([{ field: 'q', issue: 'must be 1-200 characters' }]);
    expect((await call('GET', `/assets?q=${'q'.repeat(200)}&author=${'a'.repeat(100)}`)).status).toBe(200);
  });
});

describe('GET /assets/{id}', () => {
  it('returns 404 for unknown, non-UUID and malformed ids', async () => {
    for (const id of ['00000000-0000-4000-8000-000000000000', 'nope', '%E0%A4%A']) {
      const res = await call('GET', `/assets/${id}`);
      expect(res.status).toBe(404);
      assertMatchesContract('GET', '/assets/{id}', 404, res.json);
      expect(res.json).toEqual({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
    }
  });

  it('answers other methods with 405 and Allow: GET', async () => {
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const res = await call(method, '/assets/abc');
      expect(res.status).toBe(405);
      expect(res.headers.get('allow')).toBe('GET');
      assertMatchesSchema('Error', res.json);
    }
  });
});

describe('GET /ping and general behaviour', () => {
  it('returns ok, 405 for other methods, with Allow: GET', async () => {
    const ok = await call('GET', '/ping');
    expect(ok.status).toBe(200);
    assertMatchesContract('GET', '/ping', 200, ok.json);
    expect(ok.json).toEqual({ status: 'ok' });
    const res = await call('POST', '/ping');
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
    assertMatchesSchema('Error', res.json);
  });

  it('returns 404 for unknown paths', async () => {
    const res = await call('GET', '/nope');
    expect(res.status).toBe(404);
    assertMatchesSchema('Error', res.json);
    expect(res.json).toEqual({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
  });

  it('answers OPTIONS with 204 and no body on any path', async () => {
    for (const path of ['/ping', '/assets', '/assets/x', '/nope']) {
      const res = await call('OPTIONS', path, {
        headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST' },
      });
      expect(res.status).toBe(204);
      expect(res.text).toBe('');
      expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    }
    expect((await call('OPTIONS', '/nope')).status).toBe(204);
  });

  it('sets security headers, CORS for the configured origin, and no X-Powered-By', async () => {
    const res = await call('GET', '/ping', { headers: { Origin: 'http://localhost:5173' } });
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });
});

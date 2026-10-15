import { describe, expect, it } from 'vitest';
import { api, assertMatchesContract } from './helpers.js';

describe('GET /ping', () => {
  it('returns 200 {"status":"ok"} as JSON', async () => {
    const res = await api('GET', '/ping');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toMatch(/^application\/json/);
    expect(res.body).toEqual({ status: 'ok' });
    assertMatchesContract('GET', '/ping', 200, res.body);
  });
});

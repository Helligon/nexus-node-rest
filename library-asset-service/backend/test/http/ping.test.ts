import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { assertMatchesContract, assertMatchesSchema } from '../../../contract/contract-helper.js';
import { makeTestApp } from '../support/test-app.js';

describe('/ping', () => {
  it('returns ok', async () => {
    const res = await request(makeTestApp().app).get('/ping');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    assertMatchesContract('GET', '/ping', 200, res.body);
  });

  it('rejects POST with 405', async () => {
    const res = await request(makeTestApp().app).post('/ping');
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe('GET');
    expect(res.body.error).toEqual({ code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' });
    assertMatchesSchema('Error', res.body);
  });
});

import { describe, expect, it } from 'vitest';
import { assertMatchesContract, assertMatchesSchema } from '../contract/contract-helper.js';

const BASE = 'http://127.0.0.1:3997';

describe('platform behaviour', () => {
  it('GET /ping is ok', async () => {
    const res = await fetch(`${BASE}/ping`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
    assertMatchesContract('GET', '/ping', 200, body);
  });

  it.each([
    ['POST', '/ping', 'GET'],
    ['PUT', '/ping', 'GET'],
    ['DELETE', '/assets', 'GET, POST'],
    ['PATCH', '/assets', 'GET, POST'],
    ['PUT', '/assets/abc', 'GET'],
    ['POST', '/assets/abc', 'GET'],
    ['DELETE', '/assets/abc', 'GET'],
  ])('%s %s returns 405 with Allow: %s', async (method, path, allow) => {
    const res = await fetch(`${BASE}${path}`, { method });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe(allow);
    const body = await res.json();
    expect(body).toEqual({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } });
    assertMatchesSchema('Error', body);
  });

  it('returns 404 for unknown paths', async () => {
    for (const path of ['/nope', '/assets/a/b', '/']) {
      const res = await fetch(`${BASE}${path}`);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toEqual({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
      assertMatchesSchema('Error', body);
    }
  });

  it('answers OPTIONS with 204 on any path, taking precedence over 405/404', async () => {
    for (const path of ['/ping', '/assets', '/assets/abc', '/nope']) {
      const res = await fetch(`${BASE}${path}`, {
        method: 'OPTIONS',
        headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST' },
      });
      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
      expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    }
    const plain = await fetch(`${BASE}/nope`, { method: 'OPTIONS' });
    expect(plain.status).toBe(204);
  });

  it('allows only the configured CORS origin', async () => {
    const res = await fetch(`${BASE}/ping`, { headers: { Origin: 'http://evil.example' } });
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });

  it('sends helmet headers and no X-Powered-By', async () => {
    const res = await fetch(`${BASE}/ping`);
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('strict-transport-security')).not.toBeNull();
  });
});

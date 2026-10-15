import { describe, expect, it } from 'vitest';
import { api, expectError } from './helpers.js';

describe('HTTP semantics', () => {
  it('returns 404 NOT_FOUND as JSON for an unknown route', async () => {
    expectError(await api('GET', '/no-such-route'), 404, 'NOT_FOUND');
  });

  it.each([
    ['DELETE', '/assets', 'GET, POST'],
    ['PATCH', '/assets', 'GET, POST'],
    ['PUT', '/assets/00000000-0000-4000-8000-000000000000', 'GET'],
    ['DELETE', '/assets/00000000-0000-4000-8000-000000000000', 'GET'],
    ['POST', '/ping', 'GET'],
  ])('returns 405 for %s %s with Allow: %s', async (method, path, allow) => {
    const res = await api(method, path);
    expectError(res, 405, 'METHOD_NOT_ALLOWED');
    expect(res.headers.get('allow')).toBe(allow);
  });

  it('does not reveal the server framework', async () => {
    expect((await api('GET', '/ping')).headers.get('x-powered-by')).toBeNull();
  });

  it('sends X-Content-Type-Options: nosniff', async () => {
    expect((await api('GET', '/ping')).headers.get('x-content-type-options')).toBe('nosniff');
  });
});

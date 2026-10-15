import { describe, expect, it } from 'vitest';
import { api, assertMatchesContract, createAsset, expectError, unique } from './helpers.js';

describe('GET /assets/{id}', () => {
  it('returns a created asset', async () => {
    const created = await createAsset({ title: unique('Title'), author: unique('Author') });
    const res = await api('GET', `/assets/${created.id}`);
    expect(res.status).toBe(200);
    assertMatchesContract('GET', '/assets/{id}', 200, res.body);
    expect(res.body).toEqual(created);
  });

  it('serves the path given in the Location header', async () => {
    const post = await api('POST', '/assets', { json: { title: unique('Title'), author: unique('Author') } });
    const location = post.headers.get('location');
    expect(location).toBe(`/assets/${post.body.id}`);
    const res = await api('GET', location ?? '');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(post.body);
  });

  it('returns 404 for an unknown UUID', async () => {
    const res = await api('GET', '/assets/00000000-0000-4000-8000-000000000000');
    expectError(res, 404, 'NOT_FOUND');
    assertMatchesContract('GET', '/assets/{id}', 404, res.body);
  });

  it('returns 404 for an id that is not a UUID', async () => {
    const res = await api('GET', '/assets/not-a-uuid');
    expectError(res, 404, 'NOT_FOUND');
  });
});

import { describe, expect, it } from 'vitest';
import { api, assertMatchesContract, createAsset, expectDetailFor, expectError, query, unique } from './helpers.js';

async function list(params: Record<string, string>) {
  const res = await api('GET', `/assets${query(params)}`);
  expect(res.status).toBe(200);
  assertMatchesContract('GET', '/assets', 200, res.body);
  return res.body.data as Array<Record<string, unknown>>;
}

describe('GET /assets', () => {
  it('returns a data array containing created assets', async () => {
    const created = await createAsset({ title: unique('Title'), author: unique('Author') });
    const res = await api('GET', '/assets');
    expect(res.status).toBe(200);
    assertMatchesContract('GET', '/assets', 200, res.body);
    expect(res.body.data).toContainEqual(created);
  });

  it('lists assets in creation order', async () => {
    const author = unique('Author');
    for (const title of ['First', 'Second', 'Third']) await createAsset({ title, author });
    const data = await list({ author });
    expect(data.map((asset) => asset.title)).toEqual(['First', 'Second', 'Third']);
  });

  it('filters by author: exact match, case-insensitive', async () => {
    const author = unique('Author');
    await createAsset({ title: 'One', author });
    await createAsset({ title: 'Two', author });
    await createAsset({ title: 'Three', author: `${author} Jr` });
    const data = await list({ author: author.toUpperCase() });
    expect(data).toHaveLength(2);
    expect(data.every((asset) => asset.author === author)).toBe(true);
  });

  it('trims the author filter', async () => {
    const author = unique('Author');
    await createAsset({ title: 'Only', author });
    expect(await list({ author: `  ${author}  ` })).toHaveLength(1);
  });

  it('filters by status', async () => {
    const author = unique('Author');
    await createAsset({ title: 'A', author, status: 'available' });
    await createAsset({ title: 'B', author, status: 'on_loan' });
    await createAsset({ title: 'C', author, status: 'lost' });
    const data = await list({ author, status: 'lost' });
    expect(data.map((asset) => asset.title)).toEqual(['C']);
  });

  it('filters by a case-insensitive title substring', async () => {
    const author = unique('Author');
    const token = unique('Token').replace(' ', '');
    await createAsset({ title: `The ${token} Story`, author });
    await createAsset({ title: 'Unrelated', author });
    const data = await list({ author, q: token.toUpperCase() });
    expect(data.map((asset) => asset.title)).toEqual([`The ${token} Story`]);
  });

  it('combines filters with AND', async () => {
    const author = unique('Author');
    const token = unique('Token').replace(' ', '');
    await createAsset({ title: `Alpha ${token}`, author, status: 'lost' });
    await createAsset({ title: `Beta ${token}`, author, status: 'lost' });
    await createAsset({ title: `Alpha ${token}`, author, status: 'available' });
    const data = await list({ author, status: 'lost', q: `alpha ${token}` });
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ title: `Alpha ${token}`, status: 'lost' });
  });

  it('returns an empty list when nothing matches', async () => {
    const res = await api('GET', `/assets${query({ author: unique('Nobody') })}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [] });
  });

  it.each([
    ['an unknown status', '?status=borrowed', 'status'],
    ['an unknown parameter', '?colour=red', 'colour'],
    ['a blank author', '?author=%20%20', 'author'],
    ['a repeated parameter', '?author=a&author=b', 'author'],
    ['an over-long q', `?q=${'a'.repeat(201)}`, 'q'],
    ['an over-long author', `?author=${'a'.repeat(101)}`, 'author'],
    ['an empty parameter name', '?=x', 'query'],
  ])('rejects %s with 400', async (_name, search, field) => {
    const res = await api('GET', `/assets${search}`);
    expectError(res, 400, 'VALIDATION_ERROR');
    assertMatchesContract('GET', '/assets', 400, res.body);
    expectDetailFor(res, field);
  });

  it('reports unknown parameters in query-string order, not object-key order', async () => {
    const res = await api('GET', '/assets?zz=1&5=x');
    expectError(res, 400, 'VALIDATION_ERROR');
    const details = (res.body as { error: { details: Array<{ field: string }> } }).error.details;
    expect(details.map((detail) => detail.field)).toEqual(['zz', '5']);
  });
});

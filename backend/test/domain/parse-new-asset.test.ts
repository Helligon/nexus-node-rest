import { describe, expect, it } from 'vitest';
import { parseNewAsset } from '../../src/domain/asset.js';

const issues = (body: unknown) => {
  const r = parseNewAsset(body);
  if (r.ok) throw new Error('expected failure');
  return r.issues;
};

describe('parseNewAsset', () => {
  it('returns defaults and trimmed strings', () => {
    expect(parseNewAsset({ title: '  Dune ', author: ' Frank Herbert ' })).toEqual({
      ok: true,
      value: { title: 'Dune', author: 'Frank Herbert', isbn: null, status: 'available' },
    });
  });

  it('normalises an ISBN and accepts null and a status', () => {
    const r = parseNewAsset({ title: 'a', author: 'b', isbn: '0-8044-2957-x', status: 'lost' });
    expect(r).toEqual({ ok: true, value: { title: 'a', author: 'b', isbn: '080442957X', status: 'lost' } });
    expect(parseNewAsset({ title: 'a', author: 'b', isbn: null })).toMatchObject({ ok: true, value: { isbn: null } });
  });

  it('reports missing and non-string title and author', () => {
    const required = 'is required and must be a string';
    expect(issues({})).toEqual([
      { field: 'title', issue: required },
      { field: 'author', issue: required },
    ]);
    expect(issues({ title: 1, author: null })).toEqual([
      { field: 'title', issue: required },
      { field: 'author', issue: required },
    ]);
  });

  it('reports blank and too long title and author', () => {
    expect(issues({ title: '   ', author: ' ' })).toEqual([
      { field: 'title', issue: 'must be 1-200 characters' },
      { field: 'author', issue: 'must be 1-100 characters' },
    ]);
    expect(issues({ title: 'a'.repeat(201), author: 'a'.repeat(101) })).toEqual([
      { field: 'title', issue: 'must be 1-200 characters' },
      { field: 'author', issue: 'must be 1-100 characters' },
    ]);
    expect(parseNewAsset({ title: 'a'.repeat(200), author: 'a'.repeat(100) }).ok).toBe(true);
  });

  it('counts UTF-16 code units', () => {
    expect(parseNewAsset({ title: '📚'.repeat(100), author: 'a' }).ok).toBe(true);
    expect(issues({ title: '📚'.repeat(101), author: 'a' })).toEqual([{ field: 'title', issue: 'must be 1-200 characters' }]);
  });

  it('reports invalid isbn values', () => {
    const issue = 'must be a valid ISBN-10 or ISBN-13';
    for (const isbn of ['', 'abc', '0306406153', 5, '0306\t406152', true]) {
      expect(issues({ title: 'a', author: 'b', isbn })).toEqual([{ field: 'isbn', issue }]);
    }
  });

  it('reports an invalid status', () => {
    const issue = 'must be one of available, on_loan, lost';
    for (const status of ['gone', '', 1, null]) {
      expect(issues({ title: 'a', author: 'b', status })).toEqual([{ field: 'status', issue }]);
    }
  });

  it('reports unknown keys in input order, after known fields', () => {
    expect(issues({ zed: 1, title: 5, '': 1, alpha: 2, author: 'b' })).toEqual([
      { field: 'title', issue: 'is required and must be a string' },
      { field: 'zed', issue: 'is not allowed' },
      { field: 'body', issue: 'is not allowed' },
      { field: 'alpha', issue: 'is not allowed' },
    ]);
  });

  it('orders issues title, author, isbn, status, unknown', () => {
    expect(issues({ x: 1, status: 'q', isbn: 'q', author: 1, title: 1 }).map((i) => i.field)).toEqual([
      'title',
      'author',
      'isbn',
      'status',
      'x',
    ]);
  });

  it('reports a non-object body only as body', () => {
    for (const body of [null, [], ['a'], 'text', 5]) {
      expect(issues(body)).toEqual([{ field: 'body', issue: 'must be a JSON object' }]);
    }
  });

  it('treats undefined like an empty object', () => {
    expect(issues(undefined)).toEqual(issues({}));
  });
});

import { describe, expect, it } from 'vitest';
import { parseNewAsset } from '../../src/domain/asset.js';

const issues = (body: unknown) => {
  const r = parseNewAsset(body);
  if (r.ok) throw new Error('expected failure');
  return r.issues;
};

describe('parseNewAsset', () => {
  it('returns defaults and trimmed strings for a minimal body', () => {
    expect(parseNewAsset({ title: '  Dune ', author: ' Frank Herbert  ' })).toEqual({
      ok: true,
      value: { title: 'Dune', author: 'Frank Herbert', isbn: null, status: 'available' },
    });
  });

  it('normalises the ISBN and accepts null and a status', () => {
    expect(parseNewAsset({ title: 't', author: 'a', isbn: '0-8044-2957-x', status: 'lost' })).toEqual({
      ok: true,
      value: { title: 't', author: 'a', isbn: '080442957X', status: 'lost' },
    });
    expect(parseNewAsset({ title: 't', author: 'a', isbn: null })).toMatchObject({ ok: true, value: { isbn: null } });
  });

  it('reports missing or non-string title and author', () => {
    const expected = [
      { field: 'title', issue: 'is required and must be a string' },
      { field: 'author', issue: 'is required and must be a string' },
    ];
    expect(issues({})).toEqual(expected);
    expect(issues({ title: 1, author: null })).toEqual(expected);
  });

  it('treats undefined exactly like {}', () => {
    expect(issues(undefined)).toEqual(issues({}));
  });

  it('reports blank and too long title and author', () => {
    expect(issues({ title: '   ', author: '' })).toEqual([
      { field: 'title', issue: 'must be 1-200 characters' },
      { field: 'author', issue: 'must be 1-100 characters' },
    ]);
    expect(issues({ title: 'x'.repeat(201), author: 'x'.repeat(101) })).toEqual([
      { field: 'title', issue: 'must be 1-200 characters' },
      { field: 'author', issue: 'must be 1-100 characters' },
    ]);
    expect(parseNewAsset({ title: 'x'.repeat(200), author: 'x'.repeat(100) }).ok).toBe(true);
  });

  it('counts UTF-16 code units', () => {
    expect(parseNewAsset({ title: '📚'.repeat(100), author: 'a' }).ok).toBe(true);
    expect(issues({ title: '📚'.repeat(101), author: 'a' })).toEqual([{ field: 'title', issue: 'must be 1-200 characters' }]);
  });

  it('reports invalid isbn values', () => {
    const issue = { field: 'isbn', issue: 'must be a valid ISBN-10 or ISBN-13' };
    for (const isbn of ['', 'abc', '0306406153', 5, false, {}]) {
      expect(issues({ title: 't', author: 'a', isbn })).toEqual([issue]);
    }
  });

  it('reports invalid status', () => {
    expect(issues({ title: 't', author: 'a', status: 'gone' })).toEqual([
      { field: 'status', issue: 'must be one of available, on_loan, lost' },
    ]);
    expect(issues({ title: 't', author: 'a', status: 3 })).toHaveLength(1);
  });

  it('reports unknown fields after known ones, in input order', () => {
    expect(issues({ zed: 1, title: 1, '': 2, alpha: 3, status: 'x' })).toEqual([
      { field: 'title', issue: 'is required and must be a string' },
      { field: 'author', issue: 'is required and must be a string' },
      { field: 'status', issue: 'must be one of available, on_loan, lost' },
      { field: 'zed', issue: 'is not allowed' },
      { field: 'body', issue: 'is not allowed' },
      { field: 'alpha', issue: 'is not allowed' },
    ]);
  });

  it('reports a body that is not an object', () => {
    for (const body of [null, [], [{}], 'text', 5]) {
      expect(issues(body)).toEqual([{ field: 'body', issue: 'must be a JSON object' }]);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { parseAssetFilter } from '../../src/domain/asset.js';

const parse = (qs: string) => parseAssetFilter(new URLSearchParams(qs));
const issues = (qs: string) => {
  const r = parse(qs);
  if (r.ok) throw new Error('expected failure');
  return r.issues;
};

describe('parseAssetFilter', () => {
  it('returns {} for no filters', () => {
    expect(parse('')).toEqual({ ok: true, value: {} });
  });

  it('trims and returns each valid filter', () => {
    expect(parse('author=%20Ann%20&status=lost&q=%20dune%20')).toEqual({
      ok: true,
      value: { author: 'Ann', status: 'lost', q: 'dune' },
    });
  });

  it('rejects unknown keys, including the empty key', () => {
    expect(issues('foo=1')).toEqual([{ field: 'foo', issue: 'is not a supported filter' }]);
    expect(issues('=x')).toEqual([{ field: 'query', issue: 'is not a supported filter' }]);
  });

  it('rejects repeated keys, including unknown repeated keys', () => {
    expect(issues('author=a&author=b')).toEqual([{ field: 'author', issue: 'must be given once' }]);
    expect(issues('foo=1&foo=2')).toEqual([{ field: 'foo', issue: 'is not a supported filter' }]);
  });

  it('rejects blank and over-long values', () => {
    expect(issues('author=%20&q=')).toEqual([
      { field: 'author', issue: 'must be 1-100 characters' },
      { field: 'q', issue: 'must be 1-200 characters' },
    ]);
    expect(issues(`author=${'a'.repeat(101)}&q=${'q'.repeat(201)}`)).toHaveLength(2);
    expect(parse(`author=${'a'.repeat(100)}&q=${'q'.repeat(200)}`).ok).toBe(true);
  });

  it('rejects an invalid status, including an empty one', () => {
    const issue = { field: 'status', issue: 'must be one of available, on_loan, lost' };
    expect(issues('status=gone')).toEqual([issue]);
    expect(issues('status=')).toEqual([issue]);
  });

  it('orders details author, status, q, then unknown keys in query order', () => {
    expect(issues('zz=1&5=x&q=&status=x&author=')).toEqual([
      { field: 'author', issue: 'must be 1-100 characters' },
      { field: 'status', issue: 'must be one of available, on_loan, lost' },
      { field: 'q', issue: 'must be 1-200 characters' },
      { field: 'zz', issue: 'is not a supported filter' },
      { field: '5', issue: 'is not a supported filter' },
    ]);
  });

  it('reports a repeated unknown key once', () => {
    expect(issues('a=1&b=2&a=3')).toEqual([
      { field: 'a', issue: 'is not a supported filter' },
      { field: 'b', issue: 'is not a supported filter' },
    ]);
  });
});

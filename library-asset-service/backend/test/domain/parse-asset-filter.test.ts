import { describe, expect, it } from 'vitest';
import { parseAssetFilter } from '../../src/domain/asset.js';

const parse = (qs: string) => parseAssetFilter(new URLSearchParams(qs));
const issues = (qs: string) => {
  const r = parse(qs);
  if (r.ok) throw new Error('expected failure');
  return r.issues;
};

describe('parseAssetFilter', () => {
  it('returns an empty filter for an empty query', () => {
    expect(parse('')).toEqual({ ok: true, value: {} });
  });

  it('trims and returns each valid filter', () => {
    expect(parse('author=%20Ann%20&status=lost&q=%20war%20')).toEqual({
      ok: true,
      value: { author: 'Ann', status: 'lost', q: 'war' },
    });
  });

  it('rejects unknown keys, including the empty key', () => {
    expect(issues('foo=1')).toEqual([{ field: 'foo', issue: 'is not a supported filter' }]);
    expect(issues('=x')).toEqual([{ field: 'query', issue: 'is not a supported filter' }]);
  });

  it('rejects repeated keys', () => {
    expect(issues('author=a&author=b')).toEqual([{ field: 'author', issue: 'must be given once' }]);
  });

  it('rejects blank and too long values', () => {
    expect(issues('author=%20')).toEqual([{ field: 'author', issue: 'must be 1-100 characters' }]);
    expect(issues('author=' + 'a'.repeat(101))).toEqual([{ field: 'author', issue: 'must be 1-100 characters' }]);
    expect(issues('q=')).toEqual([{ field: 'q', issue: 'must be 1-200 characters' }]);
    expect(issues('q=' + 'a'.repeat(201))).toEqual([{ field: 'q', issue: 'must be 1-200 characters' }]);
    expect(parse('q=' + 'a'.repeat(200)).ok).toBe(true);
  });

  it('rejects an invalid or empty status', () => {
    const issue = 'must be one of available, on_loan, lost';
    expect(issues('status=gone')).toEqual([{ field: 'status', issue }]);
    expect(issues('status=')).toEqual([{ field: 'status', issue }]);
  });

  it('orders details author, status, q, then unknown in query order', () => {
    expect(issues('zz=1&q=&status=x&5=x&author=').map((i) => i.field)).toEqual(['author', 'status', 'q', 'zz', '5']);
  });

  it('checks unknown, then repeated, then value', () => {
    expect(issues('status=x&status=y')).toEqual([{ field: 'status', issue: 'must be given once' }]);
  });
});

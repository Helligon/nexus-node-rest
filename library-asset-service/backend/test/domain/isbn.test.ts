import { describe, expect, it } from 'vitest';
import { isValidIsbn, normaliseIsbn } from '../../src/domain/asset.js';

describe('normaliseIsbn', () => {
  it('removes spaces and hyphens and upper-cases x', () => {
    expect(normaliseIsbn('0-8044-2957-x')).toBe('080442957X');
    expect(normaliseIsbn('978 0 306 40615 7')).toBe('9780306406157');
  });

  it('leaves tabs and non-breaking spaces in place', () => {
    expect(normaliseIsbn('0306\t406152')).toBe('0306\t406152');
    expect(normaliseIsbn('0306 406152')).toBe('0306 406152');
  });
});

describe('isValidIsbn', () => {
  it('accepts valid ISBN-10 and ISBN-13', () => {
    expect(isValidIsbn('0306406152')).toBe(true);
    expect(isValidIsbn('080442957X')).toBe(true);
    expect(isValidIsbn('9780306406157')).toBe(true);
  });

  it('rejects bad checksums', () => {
    expect(isValidIsbn('0306406153')).toBe(false);
    expect(isValidIsbn('9780306406158')).toBe(false);
  });

  it('rejects wrong lengths and bad characters', () => {
    expect(isValidIsbn('')).toBe(false);
    expect(isValidIsbn('030640615')).toBe(false);
    expect(isValidIsbn('97803064061577')).toBe(false);
    expect(isValidIsbn('03064A6152')).toBe(false);
    expect(isValidIsbn('X306406152')).toBe(false);
    expect(isValidIsbn('978030640615X')).toBe(false);
  });
});

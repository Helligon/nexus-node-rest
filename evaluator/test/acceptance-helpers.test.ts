import { describe, expect, it } from 'vitest';
import {
  isbn10CheckDigit,
  isbn13CheckDigit,
  query,
  randomIsbn10EndingInX,
  randomIsbn13,
  unique,
} from '../oracle/acceptance/helpers.js';

describe('acceptance helpers', () => {
  it('computes ISBN-13 check digits', () => {
    expect(isbn13CheckDigit('978030640615')).toBe('7');
    expect(isbn13CheckDigit('978044101359')).toBe('3');
  });

  it('computes ISBN-10 check digits including X', () => {
    expect(isbn10CheckDigit('030640615')).toBe('2');
    expect(isbn10CheckDigit('080442957')).toBe('X');
  });

  it('generates valid random ISBNs', () => {
    for (let i = 0; i < 20; i++) {
      const isbn13 = randomIsbn13();
      expect(isbn13).toMatch(/^978\d{10}$/);
      expect(isbn13CheckDigit(isbn13.slice(0, 12))).toBe(isbn13.slice(12));
      expect(randomIsbn10EndingInX()).toMatch(/^\d{9}X$/);
    }
  });

  it('makes unique labels and query strings', () => {
    expect(unique('Title')).not.toBe(unique('Title'));
    expect(query({ author: 'A B', status: 'lost' })).toBe('?author=A+B&status=lost');
  });
});

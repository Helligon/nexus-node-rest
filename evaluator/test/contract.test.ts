import { describe, expect, it } from 'vitest';
import { assertMatchesContract, assertMatchesSchema } from '../oracle/contract.js';

const asset = {
  id: '3f1c2a4e-8b7d-4c1a-9e2f-5a6b7c8d9e0f',
  title: 'Dune',
  author: 'Frank Herbert',
  isbn: '9780441013593',
  status: 'available',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('assertMatchesContract', () => {
  it('accepts a valid 201 asset', () => {
    expect(() => assertMatchesContract('POST', '/assets', 201, asset)).not.toThrow();
  });

  it('accepts a null ISBN via the {id} path template', () => {
    expect(() => assertMatchesContract('GET', '/assets/{id}', 200, { ...asset, isbn: null })).not.toThrow();
  });

  it('rejects an extra property', () => {
    expect(() => assertMatchesContract('POST', '/assets', 201, { ...asset, extra: 1 })).toThrow(/does not match the contract/);
  });

  it('rejects an un-normalised ISBN', () => {
    expect(() => assertMatchesContract('POST', '/assets', 201, { ...asset, isbn: '978-0441013593' })).toThrow();
  });

  it('accepts a list response', () => {
    expect(() => assertMatchesContract('GET', '/assets', 200, { data: [asset] })).not.toThrow();
  });

  it('requires details on VALIDATION_ERROR and forbids them elsewhere', () => {
    const detail = [{ field: 'title', issue: 'required' }];
    expect(() => assertMatchesContract('POST', '/assets', 400, { error: { code: 'VALIDATION_ERROR', message: 'x', details: detail } })).not.toThrow();
    expect(() => assertMatchesContract('POST', '/assets', 400, { error: { code: 'VALIDATION_ERROR', message: 'x' } })).toThrow();
    expect(() => assertMatchesContract('POST', '/assets', 409, { error: { code: 'CONFLICT', message: 'x', details: detail } })).toThrow();
  });

  it('resolves shared response components', () => {
    expect(() => assertMatchesContract('GET', '/assets/{id}', 404, { error: { code: 'NOT_FOUND', message: 'nope' } })).not.toThrow();
  });

  it('throws for undefined operations and statuses', () => {
    expect(() => assertMatchesContract('DELETE', '/assets', 200, {})).toThrow(/no operation DELETE \/assets/);
    expect(() => assertMatchesContract('GET', '/ping', 418, {})).toThrow(/no 418 response/);
  });
});

describe('assertMatchesSchema', () => {
  it('validates named schemas', () => {
    expect(() => assertMatchesSchema('Error', { error: { code: 'METHOD_NOT_ALLOWED', message: 'no' } })).not.toThrow();
    expect(() => assertMatchesSchema('Error', { error: { code: 'TEAPOT', message: 'no' } })).toThrow();
    expect(() => assertMatchesSchema('Nope', {})).toThrow(/no schema Nope/);
  });
});

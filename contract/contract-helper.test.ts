import { describe, expect, it } from 'vitest';
import { assertMatchesContract, assertMatchesSchema } from './contract-helper.js';

const asset = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Dune',
  author: 'Frank Herbert',
  isbn: '9780306406157',
  status: 'available',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('contract helper', () => {
  it('accepts a valid asset for POST /assets 201', () => {
    expect(() => assertMatchesContract('POST', '/assets', 201, asset)).not.toThrow();
  });

  it('accepts a null ISBN through the /assets/{id} template', () => {
    expect(() => assertMatchesContract('GET', '/assets/{id}', 200, { ...asset, isbn: null })).not.toThrow();
  });

  it('rejects an extra property', () => {
    expect(() => assertMatchesContract('POST', '/assets', 201, { ...asset, extra: 1 })).toThrow(
      'does not match the contract',
    );
  });

  it('rejects an un-normalised ISBN', () => {
    expect(() => assertMatchesContract('POST', '/assets', 201, { ...asset, isbn: '978-0-306-40615-7' })).toThrow(
      'does not match the contract',
    );
  });

  it('accepts a list response', () => {
    expect(() => assertMatchesContract('GET', '/assets', 200, { data: [asset] })).not.toThrow();
    expect(() => assertMatchesContract('GET', '/assets', 200, { data: [] })).not.toThrow();
  });

  it('requires details on VALIDATION_ERROR', () => {
    const bad = { error: { code: 'VALIDATION_ERROR', message: 'Request is invalid' } };
    expect(() => assertMatchesContract('POST', '/assets', 400, bad)).toThrow('does not match the contract');
    const good = { error: { ...bad.error, details: [{ field: 'title', issue: 'x' }] } };
    expect(() => assertMatchesContract('POST', '/assets', 400, good)).not.toThrow();
  });

  it('rejects details on other codes', () => {
    const bad = { error: { code: 'CONFLICT', message: 'm', details: [{ field: 'isbn', issue: 'x' }] } };
    expect(() => assertMatchesContract('POST', '/assets', 409, bad)).toThrow('does not match the contract');
    expect(() => assertMatchesContract('POST', '/assets', 409, { error: { code: 'CONFLICT', message: 'm' } })).not.toThrow();
  });

  it('follows a shared response component for a 404', () => {
    const body = { error: { code: 'NOT_FOUND', message: 'Resource not found' } };
    expect(() => assertMatchesContract('GET', '/assets/{id}', 404, body)).not.toThrow();
    expect(() => assertMatchesContract('GET', '/assets/{id}', 404, {})).toThrow('does not match the contract');
  });

  it('validates a named schema', () => {
    expect(() => assertMatchesSchema('Error', { error: { code: 'NOT_FOUND', message: 'm' } })).not.toThrow();
    expect(() => assertMatchesSchema('Error', { error: { code: 'NOPE', message: 'm' } })).toThrow(
      'does not match the contract',
    );
  });

  it('throws for an undefined operation, status and schema', () => {
    expect(() => assertMatchesContract('DELETE', '/assets', 200, {})).toThrow('Contract has no operation DELETE /assets');
    expect(() => assertMatchesContract('GET', '/ping', 404, {})).toThrow('Contract has no 404 response for GET /ping');
    expect(() => assertMatchesSchema('Nope', {})).toThrow('Contract has no schema Nope');
  });
});

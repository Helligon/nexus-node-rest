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
    const noDetails = { error: { code: 'VALIDATION_ERROR', message: 'Request is invalid' } };
    expect(() => assertMatchesContract('POST', '/assets', 400, noDetails)).toThrow('does not match the contract');
    const withDetails = {
      error: { code: 'VALIDATION_ERROR', message: 'Request is invalid', details: [{ field: 'title', issue: 'x' }] },
    };
    expect(() => assertMatchesContract('POST', '/assets', 400, withDetails)).not.toThrow();
  });

  it('rejects details on other codes', () => {
    const body = {
      error: { code: 'CONFLICT', message: 'm', details: [{ field: 'isbn', issue: 'x' }] },
    };
    expect(() => assertMatchesContract('POST', '/assets', 409, body)).toThrow('does not match the contract');
  });

  it('follows a shared response component for a 404', () => {
    const body = { error: { code: 'NOT_FOUND', message: 'Resource not found' } };
    expect(() => assertMatchesContract('GET', '/assets/{id}', 404, body)).not.toThrow();
    expect(() => assertMatchesContract('GET', '/assets/{id}', 404, { nope: 1 })).toThrow(
      'does not match the contract',
    );
  });

  it('throws for an undefined operation', () => {
    expect(() => assertMatchesContract('DELETE', '/assets', 200, {})).toThrow(
      'Contract has no operation DELETE /assets',
    );
  });

  it('throws for an undefined status', () => {
    expect(() => assertMatchesContract('GET', '/ping', 418, {})).toThrow(
      'Contract has no 418 response for GET /ping',
    );
  });

  it('throws for an undefined schema', () => {
    expect(() => assertMatchesSchema('Missing', {})).toThrow('Contract has no schema Missing');
  });

  it('validates against a named schema', () => {
    expect(() => assertMatchesSchema('Error', { error: { code: 'NOT_FOUND', message: 'm' } })).not.toThrow();
    expect(() => assertMatchesSchema('Error', {})).toThrow('does not match the contract');
  });
});

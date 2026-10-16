import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { assertMatchesContract, assertMatchesSchema } from '../contract/contract-helper.js';
import { BASE, call, isbn10, isbn13, postJson, unique } from './support.js';

const VALIDATION = { code: 'VALIDATION_ERROR', message: 'Request is invalid' };

describe('POST /assets', () => {
  it('creates a book: 201, Location, normalised ISBN, defaults', async () => {
    const title = unique('Created');
    const raw = isbn13();
    const dashed = `${raw.slice(0, 3)}-${raw.slice(3, 4)}-${raw.slice(4, 9)}-${raw.slice(9, 12)}-${raw.slice(12)}`;
    const res = await postJson({ title: `  ${title} `, author: ' Some Author  ', isbn: dashed });
    expect(res.status).toBe(201);
    assertMatchesContract('POST', '/assets', 201, res.json);
    expect(res.json).toMatchObject({ title, author: 'Some Author', isbn: raw, status: 'available' });
    expect(res.headers.get('location')).toBe(`/assets/${res.json.id}`);
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    expect(new Date(res.json.createdAt).toISOString()).toBe(res.json.createdAt);

    const got = await call('GET', res.headers.get('location')!);
    expect(got.status).toBe(200);
    assertMatchesContract('GET', '/assets/{id}', 200, got.json);
    expect(got.json).toEqual(res.json);
  });

  it('normalises a lower-case x and accepts ISBN-10 and a status', async () => {
    let isbn = isbn10();
    while (!isbn.endsWith('X')) isbn = isbn10();
    const res = await postJson({ title: unique('X'), author: unique('A'), isbn: isbn.toLowerCase(), status: 'on_loan' });
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({ isbn, status: 'on_loan' });
  });

  it('allows several books without an ISBN and with null', async () => {
    const author = unique('NoIsbn');
    expect((await postJson({ title: 't', author })).status).toBe(201);
    const b = await postJson({ title: 't', author, isbn: null });
    expect(b.status).toBe(201);
    expect(b.json.isbn).toBeNull();
  });

  it('returns 409 for a duplicate normalised ISBN and treats ISBN-10 and 13 as different', async () => {
    const isbn = isbn13();
    expect((await postJson({ title: unique('D'), author: 'a', isbn })).status).toBe(201);
    const dup = await postJson({ title: unique('D'), author: 'a', isbn: `${isbn.slice(0, 3)} ${isbn.slice(3)}` });
    expect(dup.status).toBe(409);
    assertMatchesContract('POST', '/assets', 409, dup.json);
    expect(dup.json).toEqual({ error: { code: 'CONFLICT', message: 'An asset with this ISBN already exists' } });
    expect((await postJson({ title: unique('D'), author: 'a', isbn: isbn10() })).status).toBe(201);
  });

  it('validates fields in order with the exact issue texts', async () => {
    const res = await postJson({ title: 5, author: '   ', isbn: '123', status: 'gone', zed: 1, '': 2, alpha: 3 });
    expect(res.status).toBe(400);
    assertMatchesContract('POST', '/assets', 400, res.json);
    expect(res.json.error).toEqual({
      ...VALIDATION,
      details: [
        { field: 'title', issue: 'is required and must be a string' },
        { field: 'author', issue: 'must be 1-100 characters' },
        { field: 'isbn', issue: 'must be a valid ISBN-10 or ISBN-13' },
        { field: 'status', issue: 'must be one of available, on_loan, lost' },
        { field: 'zed', issue: 'is not allowed' },
        { field: 'body', issue: 'is not allowed' },
        { field: 'alpha', issue: 'is not allowed' },
      ],
    });
  });

  it('reports missing fields and over-long values', async () => {
    const a = await postJson({});
    expect(a.json.error.details).toEqual([
      { field: 'title', issue: 'is required and must be a string' },
      { field: 'author', issue: 'is required and must be a string' },
    ]);
    const b = await postJson({ title: 'x'.repeat(201), author: 'x'.repeat(101), isbn: '' });
    expect(b.json.error.details).toEqual([
      { field: 'title', issue: 'must be 1-200 characters' },
      { field: 'author', issue: 'must be 1-100 characters' },
      { field: 'isbn', issue: 'must be a valid ISBN-10 or ISBN-13' },
    ]);
    expect((await postJson({ title: 'x'.repeat(200), author: 'y'.repeat(100) })).status).toBe(201);
  });

  it('counts characters as UTF-16 code units', async () => {
    expect((await postJson({ title: '📚'.repeat(100), author: 'a' })).status).toBe(201);
    const res = await postJson({ title: '📚'.repeat(101), author: 'a' });
    expect(res.json.error.details).toEqual([{ field: 'title', issue: 'must be 1-200 characters' }]);
  });

  it('only removes spaces and hyphens from an ISBN', async () => {
    const isbn = isbn13();
    for (const bad of [`\t${isbn}`, `${isbn}\u00a0`, `${isbn.slice(0, 6)}\u2013${isbn.slice(6)}`]) {
      const res = await postJson({ title: 't', author: 'a', isbn: bad });
      expect(res.status).toBe(400);
      expect(res.json.error.details).toEqual([{ field: 'isbn', issue: 'must be a valid ISBN-10 or ISBN-13' }]);
    }
  });

  it('rejects a non-object body with the body issue', async () => {
    const res = await postJson([]);
    expect(res.status).toBe(400);
    expect(res.json.error).toEqual({ ...VALIDATION, details: [{ field: 'body', issue: 'must be a JSON object' }] });
  });

  it('rejects malformed JSON and top-level null / strings', async () => {
    for (const raw of ['{bad', 'null', '"text"', '12']) {
      const res = await postJson(raw);
      expect(res.status).toBe(400);
      assertMatchesContract('POST', '/assets', 400, res.json);
      expect(res.json.error).toEqual({ ...VALIDATION, details: [{ field: 'body', issue: 'must be valid JSON' }] });
    }
  });

  it('treats an empty JSON body as {}', async () => {
    const res = await call('POST', '/assets', { headers: { 'Content-Type': 'application/json' } });
    expect(res.status).toBe(400);
    expect(res.json.error.details.map((d: { field: string }) => d.field)).toEqual(['title', 'author']);
  });

  it('returns 415 without a JSON content type, before reading the body', async () => {
    const expected = { error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Content-Type must be application/json' } };
    const a = await call('POST', '/assets', { headers: { 'Content-Type': 'text/plain' }, body: '{}' });
    expect(a.status).toBe(415);
    assertMatchesContract('POST', '/assets', 415, a.json);
    expect(a.json).toEqual(expected);
    const b = await call('POST', '/assets');
    expect(b.status).toBe(415);
    expect(b.json).toEqual(expected);
    const c = await call('POST', '/assets', { headers: { 'Content-Type': 'text/plain' }, body: 'x'.repeat(20000) });
    expect(c.status).toBe(415);
  });

  it('accepts a case-insensitive media type with parameters', async () => {
    const res = await postJson(JSON.stringify({ title: unique('CT'), author: 'a' }), {
      'Content-Type': 'Application/JSON ; charset=UTF-8',
    });
    expect(res.status).toBe(201);
  });

  it('returns 415 for an unsupported charset and content encoding', async () => {
    const a = await postJson('{}', { 'Content-Type': 'application/json; charset=latin1' });
    expect(a.status).toBe(415);
    expect(a.json.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    const b = await postJson('{}', { 'Content-Encoding': 'compress' });
    expect(b.status).toBe(415);
    assertMatchesContract('POST', '/assets', 415, b.json);
  });

  it('accepts a gzip-encoded body', async () => {
    const res = await fetch(`${BASE}/assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
      body: gzipSync(JSON.stringify({ title: unique('Gz'), author: 'a' })),
    });
    expect(res.status).toBe(201);
  });

  it('returns 400 "could not be read" for a corrupt encoded body', async () => {
    const res = await fetch(`${BASE}/assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
      body: 'this is not gzip',
    });
    const json = (await res.json()) as { error: unknown };
    expect(res.status).toBe(400);
    assertMatchesContract('POST', '/assets', 400, json);
    expect(json.error).toEqual({ ...VALIDATION, details: [{ field: 'body', issue: 'could not be read' }] });
  });

  it('returns 413 above 10 kb and accepts just under it', async () => {
    const big = await postJson({ title: 'x'.repeat(10240), author: 'a' });
    expect(big.status).toBe(413);
    assertMatchesContract('POST', '/assets', 413, big.json);
    expect(big.json).toEqual({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body must be 10 kb or smaller' } });
    const body = JSON.stringify({ title: unique('Pad'), author: 'a' }).padEnd(10239, ' ');
    expect((await postJson(body)).status).toBe(201);
  });

  it('answers wrong methods on /assets with 405 and Allow', async () => {
    for (const method of ['DELETE', 'PUT', 'PATCH']) {
      const res = await call(method, '/assets');
      expect(res.status).toBe(405);
      expect(res.headers.get('allow')).toBe('GET, POST');
      assertMatchesSchema('Error', res.json);
      expect(res.json).toEqual({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } });
    }
  });
});

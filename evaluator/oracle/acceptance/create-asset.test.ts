import { describe, expect, it } from 'vitest';
import {
  api,
  assertMatchesContract,
  createAsset,
  expectDetailFor,
  expectError,
  randomIsbn10EndingInX,
  randomIsbn13,
  unique,
} from './helpers.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('POST /assets: success', () => {
  it('creates an asset from the required fields and applies defaults', async () => {
    const title = unique('Title');
    const author = unique('Author');
    const res = await api('POST', '/assets', { json: { title, author } });
    expect(res.status).toBe(201);
    assertMatchesContract('POST', '/assets', 201, res.body);
    expect(res.body).toMatchObject({ title, author, isbn: null, status: 'available' });
    expect(res.body.id).toMatch(UUID_V4);
    expect(Number.isNaN(Date.parse(res.body.createdAt))).toBe(false);
    expect(res.headers.get('location')).toBe(`/assets/${res.body.id}`);
  });

  it('trims title and author', async () => {
    const title = unique('Title');
    const author = unique('Author');
    const res = await api('POST', '/assets', { json: { title: `  ${title}  `, author: `\t${author}\n` } });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe(title);
    expect(res.body.author).toBe(author);
  });

  it('accepts every field and normalises a hyphenated ISBN-13', async () => {
    const isbn = randomIsbn13();
    const formatted = `${isbn.slice(0, 3)}-${isbn.slice(3, 4)} ${isbn.slice(4, 8)}-${isbn.slice(8, 12)}-${isbn.slice(12)}`;
    const res = await api('POST', '/assets', {
      json: { title: unique('Title'), author: unique('Author'), isbn: formatted, status: 'on_loan' },
    });
    expect(res.status).toBe(201);
    assertMatchesContract('POST', '/assets', 201, res.body);
    expect(res.body.isbn).toBe(isbn);
    expect(res.body.status).toBe('on_loan');
  });

  it('accepts an ISBN-10 ending in a lower-case x and stores it upper-case', async () => {
    const isbn = randomIsbn10EndingInX();
    const res = await api('POST', '/assets', {
      json: { title: unique('Title'), author: unique('Author'), isbn: isbn.toLowerCase() },
    });
    expect(res.status).toBe(201);
    expect(res.body.isbn).toBe(isbn);
  });

  it('accepts an explicit null ISBN', async () => {
    const res = await api('POST', '/assets', { json: { title: unique('Title'), author: unique('Author'), isbn: null } });
    expect(res.status).toBe(201);
    expect(res.body.isbn).toBeNull();
  });

  it('accepts a 200-character title and a 100-character author', async () => {
    const res = await api('POST', '/assets', { json: { title: 'a'.repeat(200), author: 'b'.repeat(100) } });
    expect(res.status).toBe(201);
    assertMatchesContract('POST', '/assets', 201, res.body);
  });
});

describe('POST /assets: validation', () => {
  const cases: Array<[string, unknown, string]> = [
    ['a missing title', { author: 'A' }, 'title'],
    ['a blank title', { title: '   ', author: 'A' }, 'title'],
    ['a title over 200 characters', { title: 'a'.repeat(201), author: 'A' }, 'title'],
    ['a non-string title', { title: 42, author: 'A' }, 'title'],
    ['a missing author', { title: 'T' }, 'author'],
    ['a blank author', { title: 'T', author: '  ' }, 'author'],
    ['an author over 100 characters', { title: 'T', author: 'b'.repeat(101) }, 'author'],
    ['an ISBN with a bad checksum', { title: 'T', author: 'A', isbn: '9780306406158' }, 'isbn'],
    ['an ISBN with the wrong length', { title: 'T', author: 'A', isbn: '12345' }, 'isbn'],
    ['an empty-string ISBN', { title: 'T', author: 'A', isbn: '' }, 'isbn'],
    ['a non-string ISBN', { title: 'T', author: 'A', isbn: 9780306406157 }, 'isbn'],
    ['an ISBN containing a tab', { title: 'T', author: 'A', isbn: '978\t0306406157' }, 'isbn'],
    ['an unknown status', { title: 'T', author: 'A', status: 'borrowed' }, 'status'],
    ['an unknown field', { title: 'T', author: 'A', colour: 'red' }, 'colour'],
    ['a JSON array body', [], 'body'],
  ];

  it.each(cases)('rejects %s with 400', async (_name, body, field) => {
    const res = await api('POST', '/assets', { json: body });
    expectError(res, 400, 'VALIDATION_ERROR');
    assertMatchesContract('POST', '/assets', 400, res.body);
    expectDetailFor(res, field);
  });

  it('rejects malformed JSON with 400 on field "body"', async () => {
    const res = await api('POST', '/assets', { rawBody: '{"title": "Dune",', contentType: 'application/json' });
    expectError(res, 400, 'VALIDATION_ERROR');
    expectDetailFor(res, 'body');
  });

  it('treats an empty JSON body as {} and reports both required fields', async () => {
    const res = await api('POST', '/assets', { rawBody: '', contentType: 'application/json' });
    expectError(res, 400, 'VALIDATION_ERROR');
    expectDetailFor(res, 'title');
    expectDetailFor(res, 'author');
  });
});

describe('POST /assets: content type and size', () => {
  it('rejects a non-JSON content type with 415', async () => {
    const res = await api('POST', '/assets', { rawBody: 'title=Dune', contentType: 'text/plain' });
    expectError(res, 415, 'UNSUPPORTED_MEDIA_TYPE');
    assertMatchesContract('POST', '/assets', 415, res.body);
  });

  it('rejects a body over 10 kb with 413', async () => {
    const res = await api('POST', '/assets', { json: { title: 'a'.repeat(11000), author: 'A' } });
    expectError(res, 413, 'PAYLOAD_TOO_LARGE');
    assertMatchesContract('POST', '/assets', 413, res.body);
  });
});

describe('POST /assets: duplicates', () => {
  it('rejects a second asset with the same ISBN with 409', async () => {
    const isbn = randomIsbn13();
    await createAsset({ title: unique('Title'), author: unique('Author'), isbn });
    const res = await api('POST', '/assets', { json: { title: unique('Title'), author: unique('Author'), isbn } });
    expectError(res, 409, 'CONFLICT');
    assertMatchesContract('POST', '/assets', 409, res.body);
  });

  it('treats differently formatted copies of the same ISBN as duplicates', async () => {
    const isbn = randomIsbn13();
    await createAsset({ title: unique('Title'), author: unique('Author'), isbn });
    const res = await api('POST', '/assets', {
      json: { title: unique('Title'), author: unique('Author'), isbn: `${isbn.slice(0, 3)}-${isbn.slice(3)}` },
    });
    expectError(res, 409, 'CONFLICT');
  });

  it('allows two assets with the same title and author when neither has an ISBN', async () => {
    const fields = { title: unique('Title'), author: unique('Author') };
    const first = await createAsset(fields);
    const second = await createAsset(fields);
    expect(second.id).not.toBe(first.id);
  });
});

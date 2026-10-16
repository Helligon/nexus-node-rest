import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { assertMatchesContract, assertMatchesSchema } from '../contract/contract-helper.js';

const BASE = 'http://127.0.0.1:3997';

interface Body {
  id: string;
  isbn: string | null;
  data: { title: string }[];
  error: { code: string; message: string; details: { field: string; issue: string }[] };
}

let seq = 0;
const unique = (label: string): string => `${label} ${randomUUID()}`;
function isbn13(): string {
  const digits = `978${String(Date.now() + ++seq).slice(-8)}${String(Math.floor(Math.random() * 10))}`.slice(0, 12);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 3);
  return `${digits}${(10 - (sum % 10)) % 10}`;
}

async function post(body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }) {
  const res = await fetch(`${BASE}/assets`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { res, body: (await res.json()) as Body };
}
async function get(path: string) {
  const res = await fetch(`${BASE}${path}`);
  return { res, body: (await res.json()) as Body };
}

const VALIDATION = { code: 'VALIDATION_ERROR', message: 'Request is invalid' };

describe('POST /assets', () => {
  it('creates a minimal asset with defaults', async () => {
    const title = unique('t');
    const { res, body } = await post({ title: `  ${title}  `, author: ' Ann ' });
    expect(res.status).toBe(201);
    assertMatchesContract('POST', '/assets', 201, body);
    expect(res.headers.get('location')).toBe(`/assets/${body.id}`);
    expect(body).toMatchObject({ title, author: 'Ann', isbn: null, status: 'available' });
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });

  it('normalises the ISBN, accepts null and all statuses', async () => {
    const raw = isbn13();
    const hyphenated = `${raw.slice(0, 3)}-${raw.slice(3, 4)}-${raw.slice(4)}`;
    const a = await post({ title: unique('t'), author: 'a', isbn: hyphenated, status: 'on_loan' });
    expect(a.res.status).toBe(201);
    expect(a.body).toMatchObject({ isbn: raw, status: 'on_loan' });
    const b = await post({ title: unique('t'), author: 'a', isbn: null, status: 'lost' });
    expect(b.body).toMatchObject({ isbn: null, status: 'lost' });
    const c = await post({ title: unique('t'), author: 'a', isbn: '0-8044-2957-x' });
    if (c.res.status === 201) expect(c.body.isbn).toBe('080442957X');
    else expect(c.res.status).toBe(409);
  });

  it('allows duplicate title and author without an ISBN', async () => {
    const t = unique('dup');
    expect((await post({ title: t, author: 'a' })).res.status).toBe(201);
    expect((await post({ title: t, author: 'a' })).res.status).toBe(201);
  });

  it('rejects duplicate ISBNs in any formatting with 409', async () => {
    const raw = isbn13();
    expect((await post({ title: unique('t'), author: 'a', isbn: raw })).res.status).toBe(201);
    const dup = await post({ title: unique('t'), author: 'a', isbn: `${raw.slice(0, 3)} ${raw.slice(3)}` });
    expect(dup.res.status).toBe(409);
    expect(dup.body).toEqual({ error: { code: 'CONFLICT', message: 'An asset with this ISBN already exists' } });
    assertMatchesContract('POST', '/assets', 409, dup.body);
  });

  const required = 'is required and must be a string';
  const cases: [string, unknown, { field: string; issue: string }[]][] = [
    ['empty object', {}, [{ field: 'title', issue: required }, { field: 'author', issue: required }]],
    ['non-string title and author', { title: 1, author: [] }, [{ field: 'title', issue: required }, { field: 'author', issue: required }]],
    ['blank title/author', { title: '  ', author: '\t' }, [{ field: 'title', issue: 'must be 1-200 characters' }, { field: 'author', issue: 'must be 1-100 characters' }]],
    ['long title/author', { title: 'a'.repeat(201), author: 'a'.repeat(101) }, [{ field: 'title', issue: 'must be 1-200 characters' }, { field: 'author', issue: 'must be 1-100 characters' }]],
    ['101 book emoji title', { title: '📚'.repeat(101), author: 'a' }, [{ field: 'title', issue: 'must be 1-200 characters' }]],
    ['empty isbn', { title: 'a', author: 'b', isbn: '' }, [{ field: 'isbn', issue: 'must be a valid ISBN-10 or ISBN-13' }]],
    ['numeric isbn', { title: 'a', author: 'b', isbn: 9780306406157 }, [{ field: 'isbn', issue: 'must be a valid ISBN-10 or ISBN-13' }]],
    ['bad checksum', { title: 'a', author: 'b', isbn: '9780306406158' }, [{ field: 'isbn', issue: 'must be a valid ISBN-10 or ISBN-13' }]],
    ['tab in isbn', { title: 'a', author: 'b', isbn: '0306\t406152' }, [{ field: 'isbn', issue: 'must be a valid ISBN-10 or ISBN-13' }]],
    ['nbsp in isbn', { title: 'a', author: 'b', isbn: '0306 406152' }, [{ field: 'isbn', issue: 'must be a valid ISBN-10 or ISBN-13' }]],
    ['bad status', { title: 'a', author: 'b', status: 'gone' }, [{ field: 'status', issue: 'must be one of available, on_loan, lost' }]],
    ['null status', { title: 'a', author: 'b', status: null }, [{ field: 'status', issue: 'must be one of available, on_loan, lost' }]],
    ['unknown fields keep input order', { zed: 1, title: 'a', author: 'b', alpha: 2 }, [{ field: 'zed', issue: 'is not allowed' }, { field: 'alpha', issue: 'is not allowed' }]],
    ['empty key', { title: 'a', author: 'b', '': 1 }, [{ field: 'body', issue: 'is not allowed' }]],
    ['everything wrong', { x: 1, status: 'q', isbn: 'q', author: 1, title: 1 }, [
      { field: 'title', issue: required }, { field: 'author', issue: required },
      { field: 'isbn', issue: 'must be a valid ISBN-10 or ISBN-13' },
      { field: 'status', issue: 'must be one of available, on_loan, lost' },
      { field: 'x', issue: 'is not allowed' },
    ]],
    ['array body', [], [{ field: 'body', issue: 'must be a JSON object' }]],
  ];
  it.each(cases)('validation: %s', async (_name, payload, details) => {
    const { res, body } = await post(JSON.stringify(payload));
    expect(res.status).toBe(400);
    expect(body).toEqual({ error: { ...VALIDATION, details } });
    assertMatchesContract('POST', '/assets', 400, body);
  });

  it('accepts exactly 200/100 characters', async () => {
    const { res } = await post({ title: '📚'.repeat(100), author: 'a'.repeat(100) });
    expect(res.status).toBe(201);
  });

  it('rejects malformed JSON and non-container JSON values', async () => {
    for (const raw of ['{oops', 'null', '"text"', '5']) {
      const { res, body } = await post(raw);
      expect(res.status).toBe(400);
      expect(body.error).toEqual({ ...VALIDATION, details: [{ field: 'body', issue: 'must be valid JSON' }] });
    }
  });

  it('treats an empty body or missing body as {}', async () => {
    const empty = await post('');
    expect(empty.res.status).toBe(400);
    expect(empty.body.error.details.map((d: { field: string }) => d.field)).toEqual(['title', 'author']);
    const res = await fetch(`${BASE}/assets`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    expect(res.status).toBe(400);
  });

  it('checks Content-Type before the body', async () => {
    for (const headers of [{ 'Content-Type': 'text/plain' }, {} as Record<string, string>]) {
      const { res, body } = await post('{not json', headers);
      expect(res.status).toBe(415);
      expect(body).toEqual({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Content-Type must be application/json' } });
      assertMatchesContract('POST', '/assets', 415, body);
    }
  });

  it('accepts a case-insensitive media type with parameters', async () => {
    const { res } = await post({ title: unique('t'), author: 'a' }, { 'Content-Type': 'Application/JSON ; charset=utf-8' });
    expect(res.status).toBe(201);
  });

  it('rejects unsupported charset and encoding with 415', async () => {
    const a = await post('{}', { 'Content-Type': 'application/json; charset=latin1' });
    expect(a.res.status).toBe(415);
    const b = await post('{}', { 'Content-Type': 'application/json', 'Content-Encoding': 'compress' });
    expect(b.res.status).toBe(415);
    assertMatchesSchema('Error', b.body);
  });

  it('reports an unreadable body', async () => {
    const { res, body } = await post('not gzip', { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' });
    expect(res.status).toBe(400);
    expect(body.error).toEqual({ ...VALIDATION, details: [{ field: 'body', issue: 'could not be read' }] });
  });

  it('rejects bodies over 10 kb with 413', async () => {
    const { res, body } = await post({ title: 'a'.repeat(10240), author: 'b' });
    expect(res.status).toBe(413);
    expect(body.error).toEqual({ code: 'PAYLOAD_TOO_LARGE', message: 'Request body must be 10 kb or smaller' });
    assertMatchesContract('POST', '/assets', 413, body);
  });
});

describe('GET /assets/{id}', () => {
  it('returns the asset', async () => {
    const created = await post({ title: unique('t'), author: 'a' });
    const { res, body } = await get(`/assets/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(body).toEqual(created.body);
    assertMatchesContract('GET', '/assets/{id}', 200, body);
  });

  it('returns 404 for unknown, non-UUID and malformed ids', async () => {
    for (const id of [randomUUID(), 'nope', '%E0%A4%A']) {
      const { res, body } = await get(`/assets/${id}`);
      expect(res.status).toBe(404);
      expect(body).toEqual({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
      assertMatchesContract('GET', '/assets/{id}', 404, body);
    }
  });
});

describe('GET /assets', () => {
  it('lists in creation order and filters', async () => {
    const author = unique('Author');
    const t1 = unique('Alpha');
    const t2 = unique('Beta');
    const mk = (title: string, status?: string) => post({ title, author, ...(status && { status }) });
    await mk(t1, 'lost');
    await mk(t2);
    const enc = encodeURIComponent;
    const byAuthor = await get(`/assets?author=${enc(` ${author.toUpperCase()} `)}`);
    expect(byAuthor.res.status).toBe(200);
    assertMatchesContract('GET', '/assets', 200, byAuthor.body);
    expect(byAuthor.body.data.map((a: { title: string }) => a.title)).toEqual([t1, t2]);
    const byStatus = await get(`/assets?author=${enc(author)}&status=lost`);
    expect(byStatus.body.data.map((a: { title: string }) => a.title)).toEqual([t1]);
    const byQ = await get(`/assets?author=${enc(author)}&q=${enc(t2.toLowerCase().slice(1))}`);
    expect(byQ.body.data.map((a: { title: string }) => a.title)).toEqual([t2]);
    const none = await get(`/assets?author=${enc(author)}&q=${enc(unique('zzz'))}`);
    expect(none.body).toEqual({ data: [] });
  });

  const cases: [string, string, { field: string; issue: string }[]][] = [
    ['unknown parameter', '?foo=1', [{ field: 'foo', issue: 'is not a supported filter' }]],
    ['empty key', '?=x', [{ field: 'query', issue: 'is not a supported filter' }]],
    ['repeated parameter', '?author=a&author=b', [{ field: 'author', issue: 'must be given once' }]],
    ['blank author', '?author=%20', [{ field: 'author', issue: 'must be 1-100 characters' }]],
    ['long author', `?author=${'a'.repeat(101)}`, [{ field: 'author', issue: 'must be 1-100 characters' }]],
    ['empty q', '?q=', [{ field: 'q', issue: 'must be 1-200 characters' }]],
    ['long q', `?q=${'a'.repeat(201)}`, [{ field: 'q', issue: 'must be 1-200 characters' }]],
    ['bad status', '?status=gone', [{ field: 'status', issue: 'must be one of available, on_loan, lost' }]],
    ['empty status', '?status=', [{ field: 'status', issue: 'must be one of available, on_loan, lost' }]],
    ['repeated beats value check', '?status=x&status=y', [{ field: 'status', issue: 'must be given once' }]],
    ['detail order', '?zz=1&q=&5=x&status=x&author=', [
      { field: 'author', issue: 'must be 1-100 characters' },
      { field: 'status', issue: 'must be one of available, on_loan, lost' },
      { field: 'q', issue: 'must be 1-200 characters' },
      { field: 'zz', issue: 'is not a supported filter' },
      { field: '5', issue: 'is not a supported filter' },
    ]],
  ];
  it.each(cases)('rejects %s', async (_name, qs, details) => {
    const { res, body } = await get(`/assets${qs}`);
    expect(res.status).toBe(400);
    expect(body).toEqual({ error: { ...VALIDATION, details } });
    assertMatchesContract('GET', '/assets', 400, body);
  });
});

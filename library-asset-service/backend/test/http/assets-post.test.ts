import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { assertMatchesContract, assertMatchesSchema } from '../../../contract/contract-helper.js';
import { makeTestApp } from '../support/test-app.js';

const ID1 = '00000000-0000-4000-8000-000000000001';
const valid = { title: 'Dune', author: 'Frank Herbert', isbn: '978-0-306-40615-7' };

describe('POST /assets', () => {
  it('creates an asset', async () => {
    const { app, repo } = makeTestApp();
    const res = await request(app).post('/assets').send(valid);
    expect(res.status).toBe(201);
    assertMatchesContract('POST', '/assets', 201, res.body);
    expect(res.body).toEqual({
      id: ID1,
      title: 'Dune',
      author: 'Frank Herbert',
      isbn: '9780306406157',
      status: 'available',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(res.headers.location).toBe(`/assets/${ID1}`);
    expect(await repo.findById(ID1)).toEqual(res.body);
  });

  it('returns validation errors with the exact texts', async () => {
    const { app } = makeTestApp();
    const cases: [unknown, { field: string; issue: string }[]][] = [
      [{}, [
        { field: 'title', issue: 'is required and must be a string' },
        { field: 'author', issue: 'is required and must be a string' },
      ]],
      [{ title: ' ', author: 'a' }, [{ field: 'title', issue: 'must be 1-200 characters' }]],
      [{ title: 't', author: 'a', isbn: '123' }, [{ field: 'isbn', issue: 'must be a valid ISBN-10 or ISBN-13' }]],
      [{ title: 't', author: 'a', status: 'x' }, [{ field: 'status', issue: 'must be one of available, on_loan, lost' }]],
      [{ title: 't', author: 'a', extra: 1 }, [{ field: 'extra', issue: 'is not allowed' }]],
      [[], [{ field: 'body', issue: 'must be a JSON object' }]],
    ];
    for (const [body, details] of cases) {
      const res = await request(app).post('/assets').send(body as object);
      expect(res.status).toBe(400);
      assertMatchesContract('POST', '/assets', 400, res.body);
      expect(res.body).toEqual({ error: { code: 'VALIDATION_ERROR', message: 'Request is invalid', details } });
    }
  });

  it('returns 409 for a duplicate ISBN in any formatting', async () => {
    const { app } = makeTestApp();
    await request(app).post('/assets').send(valid).expect(201);
    const res = await request(app).post('/assets').send({ title: 'Other', author: 'x', isbn: '9780306406157' });
    expect(res.status).toBe(409);
    assertMatchesContract('POST', '/assets', 409, res.body);
    expect(res.body).toEqual({ error: { code: 'CONFLICT', message: 'An asset with this ISBN already exists' } });
  });

  it('allows several assets without an ISBN', async () => {
    const { app } = makeTestApp();
    await request(app).post('/assets').send({ title: 't', author: 'a' }).expect(201);
    await request(app).post('/assets').send({ title: 't', author: 'a', isbn: null }).expect(201);
  });

  it('returns 415 for a wrong or missing content type', async () => {
    const { app } = makeTestApp();
    const expected = { error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Content-Type must be application/json' } };
    const a = await request(app).post('/assets').set('Content-Type', 'text/plain').send('hi');
    expect(a.status).toBe(415);
    assertMatchesContract('POST', '/assets', 415, a.body);
    expect(a.body).toEqual(expected);
    const b = await request(app).post('/assets');
    expect(b.status).toBe(415);
    expect(b.body).toEqual(expected);
  });

  it('accepts a case-insensitive JSON media type with parameters', async () => {
    const { app } = makeTestApp();
    await request(app)
      .post('/assets')
      .set('Content-Type', ' Application/JSON ; charset=utf-8')
      .send(JSON.stringify({ title: 't', author: 'a' }))
      .expect(201);
  });

  it('returns 415 for an unsupported charset and content encoding', async () => {
    const { app } = makeTestApp();
    const a = await request(app)
      .post('/assets')
      .set('Content-Type', 'application/json; charset=latin1')
      .send('{}');
    expect(a.status).toBe(415);
    assertMatchesContract('POST', '/assets', 415, a.body);
    const b = await request(app)
      .post('/assets')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'compress')
      .send('{}');
    expect(b.status).toBe(415);
    assertMatchesContract('POST', '/assets', 415, b.body);
  });

  it('returns 400 for malformed JSON and non-object top-level values', async () => {
    const { app, logs } = makeTestApp();
    for (const raw of ['{bad', 'null', '"text"', '5']) {
      const res = await request(app).post('/assets').set('Content-Type', 'application/json').send(raw);
      expect(res.status).toBe(400);
      assertMatchesContract('POST', '/assets', 400, res.body);
      expect(res.body.error.details).toEqual([{ field: 'body', issue: 'must be valid JSON' }]);
    }
    expect(logs.errors).toEqual([]);
  });

  it('treats an empty JSON body as {}', async () => {
    const { app } = makeTestApp();
    const res = await request(app).post('/assets').set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
    assertMatchesContract('POST', '/assets', 400, res.body);
    expect(res.body.error.details.map((d: { field: string }) => d.field)).toEqual(['title', 'author']);
  });

  it('returns 413 for a body over 10 kb', async () => {
    const { app } = makeTestApp();
    const res = await request(app).post('/assets').send({ title: 'x'.repeat(10300), author: 'a' });
    expect(res.status).toBe(413);
    assertMatchesContract('POST', '/assets', 413, res.body);
    expect(res.body).toEqual({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body must be 10 kb or smaller' } });
  });

  it('answers other methods with 405 and Allow', async () => {
    const { app } = makeTestApp();
    const res = await request(app).delete('/assets');
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe('GET, POST');
    assertMatchesSchema('Error', res.body);
    expect(res.body).toEqual({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } });
  });
});

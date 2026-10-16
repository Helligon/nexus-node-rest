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
    expect(res.headers.location).toBe(`/assets/${ID1}`);
    expect(res.body).toEqual({
      id: ID1,
      title: 'Dune',
      author: 'Frank Herbert',
      isbn: '9780306406157',
      status: 'available',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(await repo.findById(ID1)).toEqual(res.body);
    assertMatchesContract('POST', '/assets', 201, res.body);
  });

  it('creates an asset without an ISBN twice', async () => {
    const { app } = makeTestApp();
    expect((await request(app).post('/assets').send({ title: 'a', author: 'b' })).status).toBe(201);
    expect((await request(app).post('/assets').send({ title: 'a', author: 'b' })).status).toBe(201);
  });

  const invalid: [string, unknown, { field: string; issue: string }[]][] = [
    ['missing fields', {}, [
      { field: 'title', issue: 'is required and must be a string' },
      { field: 'author', issue: 'is required and must be a string' },
    ]],
    ['blank title', { title: ' ', author: 'b' }, [{ field: 'title', issue: 'must be 1-200 characters' }]],
    ['long author', { title: 'a', author: 'b'.repeat(101) }, [{ field: 'author', issue: 'must be 1-100 characters' }]],
    ['bad isbn', { title: 'a', author: 'b', isbn: '123' }, [{ field: 'isbn', issue: 'must be a valid ISBN-10 or ISBN-13' }]],
    ['bad status', { title: 'a', author: 'b', status: 'x' }, [{ field: 'status', issue: 'must be one of available, on_loan, lost' }]],
    ['unknown field', { title: 'a', author: 'b', zz: 1 }, [{ field: 'zz', issue: 'is not allowed' }]],
    ['empty key', { title: 'a', author: 'b', '': 1 }, [{ field: 'body', issue: 'is not allowed' }]],
    ['array body', [], [{ field: 'body', issue: 'must be a JSON object' }]],
  ];
  it.each(invalid)('rejects %s', async (_name, body, details) => {
    const res = await request(makeTestApp().app).post('/assets').send(JSON.stringify(body)).set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { code: 'VALIDATION_ERROR', message: 'Request is invalid', details } });
    assertMatchesContract('POST', '/assets', 400, res.body);
  });

  it('rejects a duplicate ISBN however it is formatted', async () => {
    const { app } = makeTestApp();
    await request(app).post('/assets').send(valid);
    const res = await request(app).post('/assets').send({ title: 'x', author: 'y', isbn: '9780306406157' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: 'CONFLICT', message: 'An asset with this ISBN already exists' } });
    assertMatchesContract('POST', '/assets', 409, res.body);
  });

  it('rejects other content types with 415', async () => {
    const { app } = makeTestApp();
    const plain = await request(app).post('/assets').set('Content-Type', 'text/plain').send('hi');
    expect(plain.status).toBe(415);
    expect(plain.body.error).toEqual({ code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Content-Type must be application/json' });
    assertMatchesContract('POST', '/assets', 415, plain.body);
    expect((await request(app).post('/assets')).status).toBe(415);
  });

  it('accepts a case-insensitive JSON media type with parameters', async () => {
    const res = await request(makeTestApp().app)
      .post('/assets')
      .set('Content-Type', ' Application/JSON ; charset=utf-8')
      .send(JSON.stringify({ title: 'a', author: 'b' }));
    expect(res.status).toBe(201);
  });

  it('rejects malformed JSON, empty bodies and oversized bodies', async () => {
    const { app } = makeTestApp();
    const bad = await request(app).post('/assets').set('Content-Type', 'application/json').send('{oops');
    expect(bad.status).toBe(400);
    expect(bad.body.error.details).toEqual([{ field: 'body', issue: 'must be valid JSON' }]);
    assertMatchesContract('POST', '/assets', 400, bad.body);

    const prim = await request(app).post('/assets').set('Content-Type', 'application/json').send('null');
    expect(prim.body.error.details).toEqual([{ field: 'body', issue: 'must be valid JSON' }]);

    const empty = await request(app).post('/assets').set('Content-Type', 'application/json');
    expect(empty.status).toBe(400);
    expect(empty.body.error.details.map((d: { field: string }) => d.field)).toEqual(['title', 'author']);

    const big = await request(app).post('/assets').send({ title: 'a'.repeat(10240), author: 'b' });
    expect(big.status).toBe(413);
    expect(big.body.error).toEqual({ code: 'PAYLOAD_TOO_LARGE', message: 'Request body must be 10 kb or smaller' });
    assertMatchesContract('POST', '/assets', 413, big.body);
  });

  it('rejects unsupported charsets and encodings with 415', async () => {
    const { app } = makeTestApp();
    const charset = await request(app).post('/assets').set('Content-Type', 'application/json; charset=latin1').send('{}');
    expect(charset.status).toBe(415);
    const encoding = await request(app)
      .post('/assets')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'compress')
      .send('{}');
    expect(encoding.status).toBe(415);
    assertMatchesSchema('Error', encoding.body);
  });

  it('reports an unreadable body as could not be read', async () => {
    const res = await request(makeTestApp().app)
      .post('/assets')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'gzip')
      .send('definitely not gzip');
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([{ field: 'body', issue: 'could not be read' }]);
  });
});

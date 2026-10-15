import { spawn } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGoldenServer } from '../oracle/golden-server.js';

const lines: string[] = [];
const server = createGoldenServer((line) => lines.push(line));
let baseUrl = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// Async on purpose: the server lives in this process, so a blocking spawnSync would starve it.
function runAcceptance(): Promise<number> {
  const config = fileURLToPath(new URL('../oracle/acceptance/vitest.config.ts', import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['vitest', 'run', '--config', config], { env: { ...process.env, BASE_URL: baseUrl } });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) process.stderr.write(`${output}\n`);
      resolve(code ?? 1);
    });
  });
}

async function call(method: string, path: string, body?: string): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = body === undefined ? {} : { 'content-type': 'application/json' };
  const res = await fetch(`${baseUrl}${path}`, { method, headers, body });
  return { status: res.status, body: await res.json() };
}

describe('golden server error texts (instructions §4.7)', () => {
  it('uses the fixed message for every error code', async () => {
    expect(await call('GET', '/no-such-route')).toEqual({ status: 404, body: { error: { code: 'NOT_FOUND', message: 'Resource not found' } } });
    expect(await call('GET', '/assets/00000000-0000-4000-8000-000000000000')).toEqual({ status: 404, body: { error: { code: 'NOT_FOUND', message: 'Resource not found' } } });
    expect((await call('POST', '/assets', '{"title":')).body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Request is invalid', details: [{ field: 'body', issue: 'must be valid JSON' }] },
    });
    expect((await call('GET', '/assets?colour=red')).body).toMatchObject({ error: { message: 'Request is invalid' } });
  });

  it('gives one issue per field in the fixed order, unknown fields last in input order', async () => {
    const res = await call('POST', '/assets', JSON.stringify({ zeta: 1, status: 'x', isbn: 5, alpha: 2, author: '  ', title: 7 }));
    expect(res.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request is invalid',
        details: [
          { field: 'title', issue: 'is required and must be a string' },
          { field: 'author', issue: 'must be 1-100 characters' },
          { field: 'isbn', issue: 'must be a valid ISBN-10 or ISBN-13' },
          { field: 'status', issue: 'must be one of available, on_loan, lost' },
          { field: 'zeta', issue: 'is not allowed' },
          { field: 'alpha', issue: 'is not allowed' },
        ],
      },
    });
  });

  it('orders query issues author, status, q, then unknown parameters', async () => {
    const res = await call('GET', '/assets?zeta=1&q=&status=x&alpha=2&alpha=3&author=a&author=b');
    expect((res.body as { error: { details: unknown } }).error.details).toEqual([
      { field: 'author', issue: 'must be given once' },
      { field: 'status', issue: 'must be one of available, on_loan, lost' },
      { field: 'q', issue: 'must be 1-200 characters' },
      { field: 'zeta', issue: 'is not a supported filter' },
      { field: 'alpha', issue: 'is not a supported filter' },
    ]);
  });

  it('treats a top-level JSON value that is not an object or array as malformed, and an array as not an object', async () => {
    expect((await call('POST', '/assets', 'null')).body).toMatchObject({ error: { details: [{ field: 'body', issue: 'must be valid JSON' }] } });
    expect((await call('POST', '/assets', '[]')).body).toMatchObject({ error: { details: [{ field: 'body', issue: 'must be a JSON object' }] } });
  });

  it('counts characters as UTF-16 code units after trimming', async () => {
    expect((await call('POST', '/assets', JSON.stringify({ title: '📚'.repeat(100), author: 'A' }))).status).toBe(201);
    expect((await call('POST', '/assets', JSON.stringify({ title: '📚'.repeat(101), author: 'A' }))).status).toBe(400);
  });

  it('answers 404, not 500, for a path id with malformed percent-encoding, without an error log', async () => {
    const before = lines.length;
    expect(await call('GET', '/assets/%E0%A4%A')).toEqual({ status: 404, body: { error: { code: 'NOT_FOUND', message: 'Resource not found' } } });
    expect(lines.slice(before).map((line) => (JSON.parse(line) as { event: string }).event)).toEqual(['http_response']);
  });
});

describe('golden server', () => {
  it('passes the acceptance suite', async () => {
    expect(await runAcceptance()).toBe(0);
  });

  it('passes it again against the same data', async () => {
    expect(await runAcceptance()).toBe(0);
  });

  it('logs exactly one http_response line per response and nothing else', () => {
    expect(lines.length).toBeGreaterThan(50);
    for (const line of lines) {
      const entry = JSON.parse(line) as Record<string, unknown>;
      expect(entry.event).toBe('http_response');
      expect(Object.keys(entry).sort()).toEqual(['durationMs', 'event', 'level', 'method', 'path', 'status']);
      expect(String(entry.path)).not.toContain('?');
    }
  });
});

import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkLogs } from '../checks/log-check.js';
import { normaliseRecords, PROBE_STEPS, runProbe, type ProbeRecord } from '../checks/probe.js';
import { createGoldenServer } from '../oracle/golden-server.js';

const EXPECTED_STATUS: Record<string, number> = {
  ping: 200,
  'create-a': 201,
  'create-b': 201,
  'create-c': 201,
  'duplicate-isbn': 409,
  'missing-fields': 400,
  'bad-isbn': 400,
  'bad-status': 400,
  'unknown-field': 400,
  'malformed-json': 400,
  'wrong-content-type': 415,
  'too-large': 413,
  'list-all': 200,
  'list-author': 200,
  'list-status': 200,
  'list-q': 200,
  'list-combined': 200,
  'list-none': 200,
  'list-bad-status': 400,
  'list-unknown-param': 400,
  'list-numeric-key': 400,
  'list-repeated': 400,
  'get-a': 200,
  'get-missing': 404,
  'get-malformed': 404,
  'delete-assets': 405,
  'put-asset': 405,
  'post-ping': 405,
  'unknown-route': 404,
};

const lines: string[] = [];
const server = createGoldenServer((line) => lines.push(line));
let records: ProbeRecord[] = [];

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  records = await runProbe(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('probe against the golden server', () => {
  it('covers every step with the expected status', () => {
    expect(Object.keys(EXPECTED_STATUS)).toEqual(PROBE_STEPS.map((step) => step.name));
    expect(Object.fromEntries(records.map((record) => [record.name, record.status]))).toEqual(EXPECTED_STATUS);
  });

  it('logs exactly one response line per step', () => {
    expect(checkLogs(lines.join('\n'), { expectedResponses: PROBE_STEPS.length }).ok).toBe(true);
  });

  it('normalises ids and timestamps but keeps exact texts and detail order', () => {
    const normalised = normaliseRecords(records);
    const createA = normalised.find((record) => record.name === 'create-a');
    expect(createA?.location).toBe('/assets/<id:1>');
    expect(createA?.body).toMatchObject({ id: '<id:1>', createdAt: '<timestamp>' });
    const missing = normalised.find((record) => record.name === 'missing-fields');
    expect(missing?.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request is invalid',
        details: [
          { field: 'title', issue: 'is required and must be a string' },
          { field: 'author', issue: 'is required and must be a string' },
        ],
      },
    });
    const numericKey = normalised.find((record) => record.name === 'list-numeric-key');
    expect(numericKey?.body).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        details: [
          { field: 'zz', issue: 'is not a supported filter' },
          { field: '5', issue: 'is not a supported filter' },
        ],
      },
    });
    const reordered = normaliseRecords([{ ...(missing as ProbeRecord), body: { error: { code: 'VALIDATION_ERROR', message: 'Bad', details: [{ field: 'author', issue: 'x' }, { field: 'title', issue: 'y' }] } } }]);
    expect(reordered[0]?.body).toEqual({ error: { code: 'VALIDATION_ERROR', message: 'Bad', details: [{ field: 'author', issue: 'x' }, { field: 'title', issue: 'y' }] } });
  });

  it('matches the committed golden baseline', () => {
    const baseline = JSON.parse(readFileSync(new URL('../oracle/golden-probe.json', import.meta.url), 'utf8')) as ProbeRecord[];
    expect(normaliseRecords(records)).toEqual(normaliseRecords(baseline));
  });
});

describe('probe against a hung server', () => {
  it('records a status 0 step instead of throwing when a request times out', async () => {
    const hung = createServer((req, res) => {
      if (req.url === '/ping') res.end('{}');
      // every other path never responds
    });
    await new Promise<void>((resolve) => hung.listen(0, '127.0.0.1', resolve));
    try {
      const url = `http://127.0.0.1:${(hung.address() as AddressInfo).port}`;
      const steps = [
        { name: 'ping', method: 'GET', path: '/ping' },
        { name: 'stuck', method: 'GET', path: '/assets' },
        { name: 'stuck-too', method: 'GET', path: '/assets/x' },
      ];
      const result = await runProbe(url, steps, 200);
      expect(result.map((record) => [record.name, record.status])).toEqual([['ping', 200], ['stuck', 0], ['stuck-too', 0]]);
      expect(result[1]).toMatchObject({ contentType: null, location: null, allow: null });
      expect(JSON.stringify(result[1]?.body)).toContain('request failed');
    } finally {
      hung.closeAllConnections();
      await new Promise<void>((resolve) => hung.close(() => resolve()));
    }
  }, 5000);
});

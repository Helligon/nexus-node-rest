import { readFileSync } from 'node:fs';
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

  it('normalises ids, timestamps, messages and detail order', () => {
    const normalised = normaliseRecords(records);
    const createA = normalised.find((record) => record.name === 'create-a');
    expect(createA?.location).toBe('/assets/<id:1>');
    expect(createA?.body).toMatchObject({ id: '<id:1>', createdAt: '<timestamp>' });
    const missing = normalised.find((record) => record.name === 'missing-fields');
    expect(missing?.body).toEqual({ error: { code: 'VALIDATION_ERROR', message: '<text>', details: ['author', 'title'] } });
  });

  it('matches the committed golden baseline', () => {
    const baseline = JSON.parse(readFileSync(new URL('../oracle/golden-probe.json', import.meta.url), 'utf8')) as ProbeRecord[];
    expect(normaliseRecords(records)).toEqual(normaliseRecords(baseline));
  });
});

import { describe, expect, it } from 'vitest';
import { compareProbes } from '../checks/diff.js';
import type { ProbeRecord } from '../checks/probe.js';

const record = (overrides: Partial<ProbeRecord> = {}): ProbeRecord => ({
  name: 'ping',
  method: 'GET',
  path: '/ping',
  status: 200,
  contentType: 'application/json',
  location: null,
  allow: null,
  body: { status: 'ok' },
  ...overrides,
});

describe('compareProbes', () => {
  it('finds no differences in identical probes, ignoring key order', () => {
    expect(compareProbes([record({ body: { a: 1, b: 2 } })], [record({ body: { b: 2, a: 1 } })])).toEqual([]);
  });

  it('reports status, header and body differences', () => {
    const diffs = compareProbes([record()], [record({ status: 500, allow: 'GET', body: { status: 'bad' } })]);
    expect(diffs.map((diff) => diff.field)).toEqual(['status', 'allow', 'body']);
  });

  it('reports missing and unexpected steps', () => {
    expect(compareProbes([record()], [])).toEqual([{ step: 'ping', field: 'missing', expected: 'present', actual: 'absent' }]);
    expect(compareProbes([], [record()])[0]?.field).toBe('unexpected');
  });
});

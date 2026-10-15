import type { ProbeRecord } from './probe.js';

export interface Difference {
  step: string;
  field: string;
  expected: unknown;
  actual: unknown;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const FIELDS = ['status', 'contentType', 'location', 'allow', 'body'] as const;

export function compareProbes(expected: ProbeRecord[], actual: ProbeRecord[]): Difference[] {
  const differences: Difference[] = [];
  const byName = new Map(actual.map((record) => [record.name, record]));
  for (const want of expected) {
    const got = byName.get(want.name);
    if (!got) {
      differences.push({ step: want.name, field: 'missing', expected: 'present', actual: 'absent' });
      continue;
    }
    for (const field of FIELDS) {
      if (stable(want[field]) !== stable(got[field])) differences.push({ step: want.name, field, expected: want[field], actual: got[field] });
    }
  }
  const expectedNames = new Set(expected.map((record) => record.name));
  for (const record of actual) {
    if (!expectedNames.has(record.name)) differences.push({ step: record.name, field: 'unexpected', expected: 'absent', actual: 'present' });
  }
  return differences;
}

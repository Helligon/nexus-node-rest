import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProbeRecord } from '../checks/probe.js';
import { diffRound } from '../report/diff-runs.js';
import { renderReview, writeReview } from '../report/review.js';

const golden: ProbeRecord[] = [
  { name: 'ping', method: 'GET', path: '/ping', status: 200, contentType: 'application/json', location: null, allow: null, body: { status: 'ok' } },
];

const gate = (name: string, ok: boolean) => ({ name, command: name, ok, exitCode: ok ? 0 : 1, durationMs: 1, log: `logs/${name}.log` });

function checks(ok: boolean) {
  return {
    generatedAt: '2026-10-15T00:00:00.000Z',
    contract: ok ? { ok: true } : { ok: false, problem: 'contract/openapi.yaml differs from the pinned contract' },
    manifests: { ok: true, problems: [] },
    sourceScan: ok ? { ok: true, findings: [] } : { ok: false, findings: ['backend/test/a.test.ts:3: skipped or focused test'] },
    gates: [gate('install', true), gate('backend-coverage', ok)],
    coverage: ok ? { ok: true, totals: { branches: 100 }, problems: [] } : { ok: false, totals: { branches: 92 }, problems: ['branches coverage is 92%'] },
    oracle: gate('acceptance', ok),
    logs: { acceptance: { ok: true, responseLines: 10, errorLines: 0, problems: [] }, probe: { ok: true, responseLines: 29, errorLines: 0, problems: [] } },
    probe: true,
    buildReport: true,
    commits: 30,
    problems: [],
  };
}

function makeRound(): string {
  const round = mkdtempSync(join(tmpdir(), 'sw-round-'));
  for (const [run, ok, status] of [['run-1', true, 200], ['run-2', false, 500]] as const) {
    mkdirSync(join(round, run, 'score'), { recursive: true });
    writeFileSync(join(round, run, 'builder-exit-code'), '0\n');
    writeFileSync(join(round, run, 'score/checks.json'), JSON.stringify(checks(ok)));
    writeFileSync(join(round, run, 'score/probe.json'), JSON.stringify([{ ...golden[0], status }]));
  }
  writeFileSync(join(round, 'run-1', 'score/scorecard.md'), '# Scorecard\n\nRecommendation: SHIP\n');
  mkdirSync(join(round, 'run-3', 'score'), { recursive: true });
  writeFileSync(join(round, 'run-3', 'builder-exit-code'), '124\n');
  return round;
}

describe('diffRound', () => {
  it('compares every run against the golden baseline', () => {
    const result = diffRound(makeRound(), golden);
    expect(result.ok).toBe(false);
    expect(result.runs.map((run) => [run.run, run.ok])).toEqual([['run-1', true], ['run-2', false], ['run-3', false]]);
    expect(result.runs[1]?.differences[0]).toMatchObject({ step: 'ping', field: 'status', expected: 200, actual: 500 });
    expect(result.runs[2]?.note).toMatch(/no probe/);
  });
});

describe('review', () => {
  it('summarises each run and leaves the verdict to the examiner', () => {
    const round = makeRound();
    writeFileSync(join(round, 'diff.json'), JSON.stringify(diffRound(round, golden)));
    const review = renderReview(round);
    expect(review).toContain('| run-1 | 0 | PASS | PASS | PASS | 2/2 | PASS | PASS | PASS | PASS | SHIP |');
    expect(review).toContain('| run-2 | 0 | FAIL | PASS | FAIL | 1/2 | FAIL | FAIL | PASS | FAIL | missing |');
    expect(review).toContain('| run-3 | 124 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | FAIL | missing |');
    expect(review).toContain('backend/test/a.test.ts:3: skipped or focused test');
    expect(review).toContain('**Verdict (PASS / FAIL):**');
    expect(review.match(/### Examiner checklist/g)).toHaveLength(3);
  });

  it('shows a failing npm audit as an advisory finding without touching the Gates column', () => {
    const round = makeRound();
    writeFileSync(join(round, 'diff.json'), JSON.stringify(diffRound(round, golden)));
    const file = join(round, 'run-1/score/checks.json');
    writeFileSync(file, JSON.stringify({ ...checks(true), audit: { ...gate('audit', false), log: 'logs/audit.log' } }));
    const review = renderReview(round);
    expect(review).toContain('| run-1 | 0 | PASS | PASS | PASS | 2/2 | PASS | PASS | PASS | PASS | SHIP |');
    expect(review).toContain('advisory: npm audit reported issues: run-1/score/logs/audit.log');
  });

  it('tolerates corrupt evidence and unusual scorer/log states', () => {
    const round = makeRound();
    writeFileSync(join(round, 'run-2/score/probe.json'), '{not json');
    const diff = diffRound(round, golden);
    expect(diff.runs[1]).toMatchObject({ run: 'run-2', ok: false });
    expect(diff.runs[1]?.note).toMatch(/unreadable/);

    writeFileSync(join(round, 'run-2/score/checks.json'), '{not json');
    writeFileSync(join(round, 'run-1/score/checks.json'), JSON.stringify({ ...checks(true), logs: { acceptance: null, probe: { ok: true, responseLines: 1, errorLines: 0, problems: [] } } }));
    writeFileSync(join(round, 'run-1/score/scorecard.md'), '# Scorecard\n\nno recommendation here\n');
    writeFileSync(join(round, 'diff.json'), JSON.stringify(diff));
    const review = renderReview(round);
    expect(review).toContain('| run-2 | 0 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | FAIL | missing |');
    expect(review).toContain('checks.json unreadable');
    expect(review).toContain('| run-1 | 0 | PASS | PASS | PASS | 2/2 | PASS | PASS | FAIL | PASS | unreadable |');
  });

  it('never overwrites a review the examiner may have filled in', () => {
    const round = makeRound();
    writeFileSync(join(round, 'review.md'), 'examiner notes');
    expect(() => writeReview(round)).toThrow(/already exists/);
    expect(readFileSync(join(round, 'review.md'), 'utf8')).toBe('examiner notes');
  });
});

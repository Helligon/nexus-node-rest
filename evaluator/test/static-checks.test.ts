import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkContract } from '../checks/contract-check.js';
import { checkCoverage } from '../checks/coverage-check.js';
import { scanSources } from '../checks/source-scan.js';

function tree(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'sw-static-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

describe('checkContract', () => {
  const canonical = join(tree({ 'openapi.yaml': 'a: 1\n' }), 'openapi.yaml');

  it('passes an identical copy and fails an edited or missing one', () => {
    expect(checkContract(tree({ 'contract/openapi.yaml': 'a: 1\n' }), canonical)).toEqual({ ok: true });
    expect(checkContract(tree({ 'contract/openapi.yaml': 'a: 2\n' }), canonical).ok).toBe(false);
    expect(checkContract(tree({}), canonical)).toEqual({ ok: false, problem: 'contract/openapi.yaml is missing' });
  });
});

describe('scanSources', () => {
  it('passes clean sources and allows console in loggers and tests', () => {
    const dir = tree({
      'backend/src/app.ts': 'export const x = 1;\n',
      'backend/src/logger.ts': 'console.log("x");\n',
      'frontend/src/App.test.tsx': 'vi.spyOn(console, "info"); console.info("t");\n',
    });
    expect(scanSources(dir)).toEqual({ ok: true, findings: [] });
  });

  it('finds suppressions, skipped tests and stray console use', () => {
    const dir = tree({
      'backend/src/app.ts': '// eslint-disable-next-line\nconsole.log("hi");\n',
      'backend/test/a.test.ts': 'it.skip("x", () => {});\n/* v8 ignore next */\n',
      'frontend/src/x.ts': '// @ts-ignore\n',
      'backend/node_modules/pkg/index.js': '// eslint-disable\n',
    });
    expect(scanSources(dir).findings).toEqual([
      'backend/src/app.ts:1: eslint-disable comment',
      'backend/src/app.ts:2: console use outside the logger',
      'backend/test/a.test.ts:1: skipped or focused test',
      'backend/test/a.test.ts:2: coverage ignore comment',
      'frontend/src/x.ts:1: TypeScript suppression',
    ]);
  });

  it('scans the conformance suite (instructions §5, §6.4)', () => {
    const dir = tree({ 'conformance/ping.test.ts': 'it.only("x", () => {});\n' });
    expect(scanSources(dir).findings).toEqual(['conformance/ping.test.ts:1: skipped or focused test']);
  });

  it('skips scripts/check-rules.mjs, which instructions §6.4 lets hold the banned tokens as patterns', () => {
    const dir = tree({
      'scripts/check-rules.mjs': "const BANNED = [/eslint-disable/, /@ts-ignore/, /\\bit\\.skip\\b/, /v8 ignore/];\n",
      'scripts/smoke.ts': '// eslint-disable-next-line\n',
    });
    expect(scanSources(dir).findings).toEqual(['scripts/smoke.ts:1: eslint-disable comment']);
  });

  it('catches ts-nocheck and the extended skip, focus and fail forms', () => {
    const dir = tree({
      'backend/src/a.ts': '// @ts-nocheck\n',
      'backend/test/b.test.ts': [
        "it.skipIf(true)('x', () => {});",
        "test.concurrent.skip('x', () => {});",
        "describe.runIf(false)('x', () => {});",
        "it.fails('x', () => {});",
      ].join('\n') + '\n',
    });
    expect(scanSources(dir).findings).toEqual([
      'backend/src/a.ts:1: TypeScript suppression',
      'backend/test/b.test.ts:1: skipped or focused test',
      'backend/test/b.test.ts:2: skipped or focused test',
      'backend/test/b.test.ts:3: skipped or focused test',
      'backend/test/b.test.ts:4: skipped or focused test',
    ]);
  });
});

describe('checkCoverage', () => {
  function withSummary(pct: number, files: string[]): string {
    const dir = tree({ 'backend/src/app.ts': 'x', 'backend/src/server.ts': 'x', 'backend/src/domain/asset.ts': 'x' });
    const metric = { pct };
    const summary: Record<string, unknown> = { total: { lines: metric, branches: metric, functions: metric, statements: metric } };
    for (const file of files) summary[join(dir, file)] = { lines: metric };
    mkdirSync(join(dir, 'backend/coverage'), { recursive: true });
    writeFileSync(join(dir, 'backend/coverage/coverage-summary.json'), JSON.stringify(summary));
    return dir;
  }

  it('passes 100% with every source file reported (server.ts excused)', () => {
    expect(checkCoverage(withSummary(100, ['backend/src/app.ts', 'backend/src/domain/asset.ts'])).ok).toBe(true);
  });

  it('fails below 100% and when a source file is missing from the report', () => {
    const result = checkCoverage(withSummary(92, ['backend/src/app.ts']));
    expect(result.problems).toEqual([
      'lines coverage is 92%',
      'branches coverage is 92%',
      'functions coverage is 92%',
      'statements coverage is 92%',
      'backend/src/domain/asset.ts is not in the coverage report',
    ]);
  });

  it('fails when there is no report', () => {
    expect(checkCoverage(tree({})).problems).toEqual(['backend/coverage/coverage-summary.json not found']);
  });

  it('compares real paths, so a symlinked work directory still passes', () => {
    const dir = tree({ 'backend/src/app.ts': 'x', 'backend/src/server.ts': 'x' });
    const real = realpathSync(dir);
    const metric = { pct: 100 };
    const summary = { total: { lines: metric, branches: metric, functions: metric, statements: metric }, [join(real, 'backend/src/app.ts')]: { lines: metric } };
    mkdirSync(join(dir, 'backend/coverage'), { recursive: true });
    writeFileSync(join(dir, 'backend/coverage/coverage-summary.json'), JSON.stringify(summary));
    const link = join(mkdtempSync(join(tmpdir(), 'sw-link-')), 'work');
    symlinkSync(dir, link);
    expect(checkCoverage(link)).toMatchObject({ ok: true, problems: [] });
  });
});

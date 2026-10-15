import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkManifests, parseDependencyTable, parseScriptTable } from '../checks/manifest-check.js';

const INSTRUCTIONS = [
  '<!-- SCRIPTS-BEGIN -->',
  '| Workspace | Script | Command |',
  '|---|---|---|',
  '| root | `verify` | `npm test && npm audit` |',
  '| backend | `test` | `vitest run` |',
  '<!-- SCRIPTS-END -->',
  '<!-- DEPENDENCIES-BEGIN -->',
  '| Workspace | Section | Package | Version |',
  '|---|---|---|---|',
  '| root | devDependencies | `typescript` | `5.9.3` |',
  '| backend | dependencies | `express` | `5.2.1` |',
  '<!-- DEPENDENCIES-END -->',
].join('\n');

function project(manifests: Record<string, object>): string {
  const dir = mkdtempSync(join(tmpdir(), 'sw-manifest-'));
  for (const [file, content] of Object.entries(manifests)) {
    mkdirSync(join(dir, file, '..'), { recursive: true });
    writeFileSync(join(dir, file), JSON.stringify(content));
  }
  return dir;
}

const good = {
  'package.json': { scripts: { verify: 'npm test && npm audit' }, devDependencies: { typescript: '5.9.3' } },
  'backend/package.json': { scripts: { test: 'vitest run' }, dependencies: { express: '5.2.1' } },
  'frontend/package.json': {},
};

describe('table parsing', () => {
  it('parses dependency and script rows', () => {
    expect(parseDependencyTable(INSTRUCTIONS)).toEqual([
      { workspace: 'root', section: 'devDependencies', name: 'typescript', version: '5.9.3' },
      { workspace: 'backend', section: 'dependencies', name: 'express', version: '5.2.1' },
    ]);
    expect(parseScriptTable(INSTRUCTIONS)).toEqual([
      { workspace: 'root', name: 'verify', command: 'npm test && npm audit' },
      { workspace: 'backend', name: 'test', command: 'vitest run' },
    ]);
  });

  it('fails loudly when a table is missing', () => {
    expect(() => parseDependencyTable('nothing')).toThrow(/no DEPENDENCIES table/);
  });

  it('parses the real instructions.md: every version exact', () => {
    const real = readFileSync(fileURLToPath(new URL('../../instructions.md', import.meta.url)), 'utf8');
    const pins = parseDependencyTable(real);
    expect(pins.length).toBeGreaterThan(30);
    for (const pin of pins) expect(pin.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(parseScriptTable(real).map((script) => `${script.workspace}:${script.name}`)).toContain('root:verify');
  });
});

describe('checkManifests', () => {
  it('passes matching manifests', () => {
    expect(checkManifests(project(good), INSTRUCTIONS)).toEqual({ ok: true, problems: [] });
  });

  it('catches ranges, extras, missing packages and changed scripts', () => {
    const dir = project({
      'package.json': { scripts: { verify: 'npm test', extra: 'x' }, devDependencies: { typescript: '^5.9.3', lodash: '4.17.21' } },
      'backend/package.json': { scripts: { test: 'vitest run' } },
      'frontend/package.json': {},
    });
    expect(checkManifests(dir, INSTRUCTIONS).problems).toEqual([
      'package.json devDependencies: typescript is "^5.9.3", expected exactly "5.9.3"',
      'package.json devDependencies: unexpected lodash',
      'package.json scripts.verify: expected `npm test && npm audit`, found `npm test`',
      'package.json scripts: unexpected extra',
      'backend/package.json dependencies: missing express',
    ]);
  });

  it('reports a missing manifest', () => {
    const dir = project({ 'package.json': good['package.json'], 'backend/package.json': good['backend/package.json'] });
    expect(checkManifests(dir, INSTRUCTIONS).problems).toEqual(['frontend/package.json is missing']);
  });
});

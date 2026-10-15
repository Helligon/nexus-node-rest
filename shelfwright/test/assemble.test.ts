import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { assemble, FORBIDDEN_VOCABULARY, renderContract, sha256 } from '../src/assemble.js';

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
const contract = read('../contract/openapi.yaml');
const template = read('../instructions.template.md');

describe('renderContract', () => {
  it('wraps the contract in markers and a four-backtick fence', () => {
    expect(renderContract('a: 1\n')).toBe('<!-- BEGIN contract/openapi.yaml -->\n````yaml\na: 1\n````\n<!-- END contract/openapi.yaml -->');
  });

  it('rejects content without a trailing newline or with a four-backtick fence', () => {
    expect(() => renderContract('a: 1')).toThrow(/newline/);
    expect(() => renderContract('````\n')).toThrow(/backticks/);
  });
});

describe('assemble', () => {
  it('replaces both placeholders', () => {
    const out = assemble('{{CONTRACT}}\nhash {{CONTRACT_SHA256}} and {{CONTRACT_SHA256}}\n', 'a: 1\n');
    expect(out).toContain('````yaml\na: 1\n````');
    expect(out.match(new RegExp(sha256('a: 1\n'), 'g'))).toHaveLength(2);
  });

  it('requires {{CONTRACT}} exactly once and {{CONTRACT_SHA256}} at least once', () => {
    expect(() => assemble('{{CONTRACT_SHA256}}', 'a\n')).toThrow(/exactly once/);
    expect(() => assemble('{{CONTRACT}}{{CONTRACT}}{{CONTRACT_SHA256}}', 'a\n')).toThrow(/exactly once/);
    expect(() => assemble('{{CONTRACT}}', 'a\n')).toThrow(/CONTRACT_SHA256/);
  });

  it('fails on unknown placeholders', () => {
    expect(() => assemble('{{CONTRACT}}{{CONTRACT_SHA256}}{{OTHER}}', 'a\n')).toThrow(/Unreplaced placeholder \{\{OTHER\}\}/);
  });
});

describe('the real instructions.md', () => {
  const assembled = assemble(template, contract);

  it('embeds the contract byte-for-byte and its correct hash', () => {
    const block = /<!-- BEGIN contract\/openapi.yaml -->\n````yaml\n([\s\S]*?)````\n<!-- END contract\/openapi.yaml -->/.exec(assembled);
    expect(block?.[1]).toBe(contract);
    expect(assembled).toContain(sha256(contract));
  });

  it('never mentions evaluation', () => {
    expect(assembled.match(FORBIDDEN_VOCABULARY)).toBeNull();
  });

  it('has dependency and script tables', () => {
    expect(assembled).toMatch(/<!-- DEPENDENCIES-BEGIN -->[\s\S]+<!-- DEPENDENCIES-END -->/);
    expect(assembled).toMatch(/<!-- SCRIPTS-BEGIN -->[\s\S]+<!-- SCRIPTS-END -->/);
  });

  it('table rows match the declared formats', () => {
    const section = (begin: string, end: string) =>
      new RegExp(`<!-- ${begin} -->([\\s\\S]*?)<!-- ${end} -->`).exec(assembled)?.[1] ?? '';
    const rows = (text: string) =>
      text.split('\n').filter((line) => line.startsWith('|') && !line.startsWith('| Workspace') && !line.startsWith('|---'));
    const depRows = rows(section('DEPENDENCIES-BEGIN', 'DEPENDENCIES-END'));
    const scriptRows = rows(section('SCRIPTS-BEGIN', 'SCRIPTS-END'));
    expect(depRows.length).toBeGreaterThan(0);
    expect(scriptRows.length).toBeGreaterThan(0);
    for (const row of depRows) {
      expect(row).toMatch(/^\| (root|backend|frontend) \| (dependencies|devDependencies) \| `[^`]+` \| `\d+\.\d+\.\d+` \|$/);
    }
    for (const row of scriptRows) {
      expect(row).toMatch(/^\| (root|backend|frontend) \| `[^`]+` \| `[^`]+` \|$/);
    }
    expect(scriptRows.join('\n')).not.toContain('npm audit');
  });

  it('is committed up to date at the repo root', () => {
    expect(read('../../instructions.md')).toBe(assembled);
  });
});

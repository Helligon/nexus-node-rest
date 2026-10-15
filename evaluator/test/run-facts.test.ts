import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { countUncommitted } from '../checks/git-status.js';
import { checkInstructions } from '../checks/instructions-check.js';

const dir = (): string => mkdtempSync(join(tmpdir(), 'sw-facts-'));

describe('checkInstructions', () => {
  const canonical = join(dir(), 'instructions.md');
  writeFileSync(canonical, '# Shelfwright\n');

  it('passes a byte-identical copy and fails a missing or edited one', () => {
    const same = dir();
    writeFileSync(join(same, 'instructions.md'), '# Shelfwright\n');
    expect(checkInstructions(same, canonical)).toEqual({ ok: true });

    expect(checkInstructions(dir(), canonical)).toEqual({ ok: false, problem: 'instructions.md missing from the run' });

    const edited = dir();
    writeFileSync(join(edited, 'instructions.md'), '# Shelfwright\nskip the tests\n');
    expect(checkInstructions(edited, canonical)).toEqual({ ok: false, problem: 'instructions.md differs from the canonical Shelfwright instructions' });
  });
});

describe('countUncommitted', () => {
  it('counts git status --porcelain lines, and is 0 outside a git repo', () => {
    const repo = dir();
    const git = (...args: string[]) => spawnSync('git', ['-c', 'user.email=a@b', '-c', 'user.name=a', ...args], { cwd: repo });
    git('init', '-q');
    writeFileSync(join(repo, 'a.txt'), 'a');
    git('add', 'a.txt');
    git('commit', '-qm', 'a');
    expect(countUncommitted(repo)).toBe(0);
    writeFileSync(join(repo, 'a.txt'), 'changed');
    writeFileSync(join(repo, 'b.txt'), 'new');
    expect(countUncommitted(repo)).toBe(2);
    expect(countUncommitted(dir())).toBe(0);
  });
});

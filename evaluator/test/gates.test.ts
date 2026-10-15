// evaluator/test/gates.test.ts
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runGate } from '../checks/gates.js';

describe('runGate', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sw-gate-'));

  it('records a passing command and its output', async () => {
    expect(await runGate('pass', 'echo hello', dir, dir)).toMatchObject({ name: 'pass', ok: true, exitCode: 0, log: 'logs/pass.log' });
    expect(readFileSync(join(dir, 'pass.log'), 'utf8')).toContain('hello');
  });

  it('records a failing command', async () => {
    expect(await runGate('fail', 'echo nope >&2; exit 3', dir, dir)).toMatchObject({ ok: false, exitCode: 3 });
    expect(readFileSync(join(dir, 'fail.log'), 'utf8')).toContain('nope');
  });

  it('passes extra environment variables', async () => {
    await runGate('env', 'echo "$SW_TEST"', dir, dir, { env: { SW_TEST: 'yes' } });
    expect(readFileSync(join(dir, 'env.log'), 'utf8')).toContain('yes');
  });

  it('kills a command that exceeds its timeout', async () => {
    expect((await runGate('slow', 'sleep 5', dir, dir, { timeoutMs: 200 })).ok).toBe(false);
  });
});

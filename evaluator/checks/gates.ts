import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface GateResult {
  name: string;
  command: string;
  ok: boolean;
  exitCode: number | null;
  durationMs: number;
  log: string;
}

export function runGate(
  name: string,
  command: string,
  cwd: string,
  logDir: string,
  options: { timeoutMs?: number; env?: Record<string, string> } = {},
): Promise<GateResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', command], { cwd, env: { ...process.env, ...options.env }, detached: true });
    let output = `$ ${command}\n`;
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    const timer = setTimeout(() => {
      output += `\n[killed after ${options.timeoutMs} ms]\n`;
      if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL');
    }, options.timeoutMs ?? 20 * 60_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      writeFileSync(join(logDir, `${name}.log`), output);
      resolve({ name, command, ok: code === 0, exitCode: code, durationMs: Date.now() - started, log: `logs/${name}.log` });
    });
  });
}

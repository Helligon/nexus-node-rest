import { type ChildProcess, spawn } from 'node:child_process';
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

// Signals the whole process group; a group that has already exited (ESRCH) is not an error.
function killGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  try {
    if (child.pid !== undefined) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

export function runGate(
  name: string,
  command: string,
  cwd: string,
  logDir: string,
  options: { timeoutMs?: number; env?: Record<string, string> } = {},
): Promise<GateResult> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? 20 * 60_000;
  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', command], { cwd, env: { ...process.env, ...options.env }, detached: true });
    let output = `$ ${command}\n`;
    let finished = false;
    const timer = setTimeout(() => {
      output += `\n[killed after ${timeoutMs} ms]\n`;
      killGroup(child, 'SIGKILL');
    }, timeoutMs);
    const finish = (code: number | null): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      writeFileSync(join(logDir, `${name}.log`), output);
      resolve({ name, command, ok: code === 0, exitCode: code, durationMs: Date.now() - started, log: `logs/${name}.log` });
    };
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.on('error', (error) => {
      output += `\n${error.message}\n`;
      finish(null);
    });
    child.on('close', (code) => finish(code));
  });
}

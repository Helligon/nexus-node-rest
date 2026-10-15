import { type ChildProcess, spawn } from 'node:child_process';

export interface RunningServer {
  url: string;
  stop(): Promise<string>;
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

export async function startServer(options: { command: string; args: string[]; cwd: string; port: number }): Promise<RunningServer> {
  const child = spawn(options.command, options.args, { cwd: options.cwd, env: { ...process.env, PORT: String(options.port) }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
  const exited = new Promise<void>((resolve) => child.on('exit', () => resolve()));
  const url = `http://127.0.0.1:${options.port}`;
  const output = (): string => [stdout, stderr].filter((part) => part.length > 0).join('\n');
  const deadline = Date.now() + 20_000;

  for (;;) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Server exited early with code ${child.exitCode ?? child.signalCode}:\n${output()}`);
    }
    try {
      if ((await fetch(`${url}/ping`, { signal: AbortSignal.timeout(1000) })).ok) break;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) {
      killGroup(child, 'SIGKILL');
      throw new Error(`Server did not answer /ping within 20 s:\n${output()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return {
    url,
    async stop() {
      killGroup(child, 'SIGTERM');
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
      if (child.exitCode === null && child.signalCode === null) killGroup(child, 'SIGKILL');
      return output();
    },
  };
}

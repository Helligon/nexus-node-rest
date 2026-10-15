import { spawn } from 'node:child_process';

export interface RunningServer {
  url: string;
  stop(): Promise<string>;
}

export async function startServer(options: { command: string; args: string[]; cwd: string; port: number }): Promise<RunningServer> {
  const child = spawn(options.command, options.args, { cwd: options.cwd, env: { ...process.env, PORT: String(options.port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
  const exited = new Promise<void>((resolve) => child.on('exit', () => resolve()));
  const url = `http://127.0.0.1:${options.port}`;
  const output = (): string => [stdout, stderr].filter((part) => part.length > 0).join('\n');
  const deadline = Date.now() + 20_000;

  for (;;) {
    if (child.exitCode !== null) throw new Error(`Server exited early with code ${child.exitCode}:\n${output()}`);
    try {
      if ((await fetch(`${url}/ping`)).ok) break;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) {
      child.kill('SIGKILL');
      throw new Error(`Server did not answer /ping within 20 s:\n${output()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return {
    url,
    async stop() {
      child.kill('SIGTERM');
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      return output();
    },
  };
}

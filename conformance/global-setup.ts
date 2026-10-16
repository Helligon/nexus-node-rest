import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PORT = 3997;
const BASE = `http://127.0.0.1:${PORT}`;
const SERVER = fileURLToPath(new URL('../backend/dist/server.js', import.meta.url));

let child: ChildProcess | undefined;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const exited = (c: ChildProcess): boolean => c.exitCode !== null || c.signalCode !== null;

async function answers(): Promise<boolean> {
  try {
    return (await fetch(`${BASE}/ping`)).status === 200;
  } catch {
    return false;
  }
}

function waitForExit(c: ChildProcess, ms: number): Promise<boolean> {
  if (exited(c)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    c.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

async function stop(c: ChildProcess): Promise<void> {
  if (exited(c)) return;
  c.kill('SIGTERM');
  if (!(await waitForExit(c, 5000))) {
    c.kill('SIGKILL');
    await waitForExit(c, 5000);
  }
}

export async function setup(): Promise<void> {
  if (await answers()) throw new Error(`Port ${PORT} is already in use`);
  const started = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(PORT), CORS_ORIGIN: 'http://localhost:5173' },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  child = started;
  const deadline = Date.now() + 20000;
  for (;;) {
    if (exited(started)) throw new Error('Server exited before it became ready');
    if (await answers()) return;
    if (Date.now() > deadline) {
      await stop(started);
      throw new Error('Server was not ready within 20 seconds');
    }
    await sleep(100);
  }
}

export async function teardown(): Promise<void> {
  if (child) await stop(child);
}

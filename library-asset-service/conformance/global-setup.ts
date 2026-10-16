import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PORT = 3997;
const base = `http://127.0.0.1:${PORT}`;
let child: ChildProcess | undefined;
let exited = false;
let exitPromise: Promise<void> = Promise.resolve();

async function ping(): Promise<boolean> {
  try {
    return (await fetch(`${base}/ping`)).status === 200;
  } catch {
    return false;
  }
}

async function stop(): Promise<void> {
  if (!child || exited) return;
  child.kill('SIGTERM');
  const done = await Promise.race([
    exitPromise.then(() => true),
    new Promise<boolean>((r) => setTimeout(() => r(false), 5000)),
  ]);
  if (!done) {
    child.kill('SIGKILL');
    await exitPromise;
  }
}

export async function setup(): Promise<void> {
  if (await ping()) throw new Error(`Something already answers /ping on port ${PORT}`);
  const server = fileURLToPath(new URL('../backend/dist/server.js', import.meta.url));
  child = spawn(process.execPath, [server], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  exitPromise = new Promise<void>((resolve) => {
    child!.once('exit', () => {
      exited = true;
      resolve();
    });
  });
  const deadline = Date.now() + 20_000;
  try {
    for (;;) {
      if (exited) throw new Error('Server exited before /ping answered');
      if (await ping()) return;
      if (Date.now() > deadline) throw new Error('Server did not become ready within 20 seconds');
      await new Promise((r) => setTimeout(r, 100));
    }
  } catch (err) {
    await stop();
    throw err;
  }
}

export async function teardown(): Promise<void> {
  await stop();
}

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}`;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function answers(): Promise<boolean> {
  try {
    return (await fetch(`${BASE}/ping`)).status === 200;
  } catch {
    return false;
  }
}

function waitForExit(child: ChildProcess, ms: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  if (!(await waitForExit(child, 5000))) {
    child.kill('SIGKILL');
    await waitForExit(child, 5000);
  }
}

function expectStatus(actual: number, expected: number, what: string): void {
  if (actual !== expected) throw new Error(`${what}: expected ${expected}, got ${actual}`);
}

if (await answers()) throw new Error(`Port ${PORT} is already in use`);

const child = spawn(process.execPath, ['backend/dist/server.js'], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'inherit', 'inherit'],
});

try {
  const deadline = Date.now() + 20000;
  for (;;) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('Server exited before it became ready');
    if (await answers()) break;
    if (Date.now() > deadline) throw new Error('Server was not ready within 20 seconds');
    await sleep(100);
  }

  const title = `Smoke test ${Date.now()}`;
  const created = await fetch(`${BASE}/assets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, author: 'Smoke Author' }),
  });
  expectStatus(created.status, 201, 'POST /assets');
  const asset = await created.json();
  const location = created.headers.get('location');
  if (!location) throw new Error('POST /assets: no Location header');

  const fetched = await fetch(`${BASE}${location}`);
  expectStatus(fetched.status, 200, `GET ${location}`);
  if (JSON.stringify(await fetched.json()) !== JSON.stringify(asset)) throw new Error('Fetched asset differs');

  const listed = await fetch(`${BASE}/assets?q=${encodeURIComponent(title)}`);
  expectStatus(listed.status, 200, 'GET /assets');
  const { data } = (await listed.json()) as { data: { id: string }[] };
  if (!data.some((a) => a.id === (asset as { id: string }).id)) throw new Error('Created asset missing from list');
} finally {
  await stop(child);
}

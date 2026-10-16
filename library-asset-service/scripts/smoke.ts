import { spawn } from 'node:child_process';

const PORT = 3999;
const base = `http://127.0.0.1:${PORT}`;

async function ping(): Promise<boolean> {
  try {
    return (await fetch(`${base}/ping`)).status === 200;
  } catch {
    return false;
  }
}

if (await ping()) throw new Error(`Something already answers /ping on port ${PORT}`);

const child = spawn(process.execPath, ['backend/dist/server.js'], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'inherit', 'inherit'],
});
let exited = false;
const exitPromise = new Promise<void>((resolve) => {
  child.once('exit', () => {
    exited = true;
    resolve();
  });
});

const waitForExit = (ms: number) =>
  Promise.race([exitPromise.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), ms))]);

try {
  const deadline = Date.now() + 20_000;
  for (;;) {
    if (exited) throw new Error('Server exited before /ping answered');
    if (await ping()) break;
    if (Date.now() > deadline) throw new Error('Server did not become ready within 20 seconds');
    await new Promise((r) => setTimeout(r, 100));
  }

  const title = `Smoke test book ${Date.now()}`;
  const created = await fetch(`${base}/assets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, author: 'Smoke Author' }),
  });
  if (created.status !== 201) throw new Error(`POST /assets returned ${created.status}`);
  const asset = (await created.json()) as { id: string };
  const location = created.headers.get('location');
  if (!location) throw new Error('POST /assets returned no Location header');

  const fetched = await fetch(`${base}${location}`);
  if (fetched.status !== 200) throw new Error(`GET ${location} returned ${fetched.status}`);
  if (JSON.stringify(await fetched.json()) !== JSON.stringify(asset)) throw new Error('Fetched asset differs from created asset');

  const listed = await fetch(`${base}/assets?q=${encodeURIComponent(title)}`);
  if (listed.status !== 200) throw new Error(`GET /assets returned ${listed.status}`);
  const { data } = (await listed.json()) as { data: { id: string }[] };
  if (!data.some((a) => a.id === asset.id)) throw new Error('Created asset missing from list');
} finally {
  if (!exited) {
    child.kill('SIGTERM');
    if (!(await waitForExit(5000))) {
      child.kill('SIGKILL');
      await exitPromise;
    }
  }
}

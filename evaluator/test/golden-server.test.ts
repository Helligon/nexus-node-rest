import { spawn } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGoldenServer } from '../oracle/golden-server.js';

const lines: string[] = [];
const server = createGoldenServer((line) => lines.push(line));
let baseUrl = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// Async on purpose: the server lives in this process, so a blocking spawnSync would starve it.
function runAcceptance(): Promise<number> {
  const config = fileURLToPath(new URL('../oracle/acceptance/vitest.config.ts', import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['vitest', 'run', '--config', config], { env: { ...process.env, BASE_URL: baseUrl } });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) process.stderr.write(`${output}\n`);
      resolve(code ?? 1);
    });
  });
}

describe('golden server', () => {
  it('passes the acceptance suite', async () => {
    expect(await runAcceptance()).toBe(0);
  });

  it('passes it again against the same data', async () => {
    expect(await runAcceptance()).toBe(0);
  });

  it('logs exactly one http_response line per response and nothing else', () => {
    expect(lines.length).toBeGreaterThan(50);
    for (const line of lines) {
      const entry = JSON.parse(line) as Record<string, unknown>;
      expect(entry.event).toBe('http_response');
      expect(Object.keys(entry).sort()).toEqual(['durationMs', 'event', 'level', 'method', 'path', 'status']);
      expect(String(entry.path)).not.toContain('?');
    }
  });
});

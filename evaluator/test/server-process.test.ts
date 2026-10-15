// evaluator/test/server-process.test.ts
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { startServer } from '../checks/server-process.js';

const evaluatorDir = fileURLToPath(new URL('..', import.meta.url));

describe('startServer', () => {
  it('waits for /ping and returns captured output on stop', async () => {
    const server = await startServer({ command: process.execPath, args: ['--import', 'tsx', 'oracle/golden-server.ts'], cwd: evaluatorDir, port: 4192 });
    await fetch(`${server.url}/assets`);
    const output = await server.stop();
    expect(output.split('\n').filter((line) => line.includes('http_response'))).toHaveLength(2);
  });

  it('fails clearly when the server exits early', async () => {
    await expect(startServer({ command: process.execPath, args: ['-e', 'process.exit(4)'], cwd: evaluatorDir, port: 4193 })).rejects.toThrow(/exited early/);
  });
});

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Vitest overwrites process.env.BASE_URL with Vite's `base` ("/"), so capture the caller's value here
// and hand it to the test workers explicitly.
const baseUrl = process.env.BASE_URL;

// Black-box suite. Runs over HTTP against BASE_URL; never imports a build's code.
export default defineConfig({
  test: {
    root: fileURLToPath(new URL('.', import.meta.url)),
    include: ['**/*.test.ts'],
    testTimeout: 15000,
    fileParallelism: false,
    env: baseUrl === undefined ? {} : { BASE_URL: baseUrl },
  },
});

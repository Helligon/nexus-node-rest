import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Black-box suite. Runs over HTTP against BASE_URL; never imports a build's code.
export default defineConfig({
  test: {
    root: fileURLToPath(new URL('.', import.meta.url)),
    include: ['**/*.test.ts'],
    testTimeout: 15000,
    fileParallelism: false,
  },
});

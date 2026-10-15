import { describe, expect, it } from 'vitest';

describe('toolchain', () => {
  it('runs on Node 24', () => {
    expect(process.versions.node.startsWith('24.')).toBe(true);
  });
});

// Enforces instructions.md ground rules 3 and 7 independently of the build's own lint config.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listFiles } from './files.js';

const ROOTS = ['backend/src', 'backend/test', 'frontend/src', 'contract', 'scripts'];
const SOURCE = /\.(ts|tsx|js|mjs|cjs)$/;
const LOGGERS = new Set(['backend/src/logger.ts', 'frontend/src/logger.ts']);
// instructions §6.4: the build's own rule checker is the one file allowed to hold the banned tokens as patterns.
const EXEMPT = new Set(['scripts/check-rules.mjs']);
const FORBIDDEN: Array<[RegExp, string]> = [
  [/eslint-disable/, 'eslint-disable comment'],
  [/@ts-(?:ignore|expect-error|nocheck)/, 'TypeScript suppression'],
  [/\b(?:it|test|describe|suite)(?:\.\w+)*\.(?:skip|skipIf|runIf|only|todo|fails)\b/, 'skipped or focused test'],
  [/\b(?:istanbul|v8|c8) ignore\b/, 'coverage ignore comment'],
];

function isTestFile(path: string): boolean {
  return /\.test\.[cm]?[tj]sx?$/.test(path) || path.startsWith('backend/test/') || path.startsWith('frontend/src/test/');
}

export function scanSources(workDir: string): { ok: boolean; findings: string[] } {
  const findings: string[] = [];
  for (const root of ROOTS) {
    const dir = join(workDir, root);
    if (!existsSync(dir)) continue;
    for (const relative of listFiles(dir)) {
      if (!SOURCE.test(relative)) continue;
      const path = `${root}/${relative}`;
      if (EXEMPT.has(path)) continue;
      const appSource = (root === 'backend/src' || root === 'frontend/src') && !isTestFile(path) && !LOGGERS.has(path);
      readFileSync(join(dir, relative), 'utf8').split('\n').forEach((line, index) => {
        for (const [pattern, label] of FORBIDDEN) if (pattern.test(line)) findings.push(`${path}:${index + 1}: ${label}`);
        if (appSource && /\bconsole\./.test(line)) findings.push(`${path}:${index + 1}: console use outside the logger`);
      });
    }
  }
  return { ok: findings.length === 0, findings };
}

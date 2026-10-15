// Reads the coverage report itself, so a loosened config cannot hide gaps (instructions.md §4.5, §6.1).
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { listFiles } from './files.js';

const METRICS = ['lines', 'branches', 'functions', 'statements'];

export function checkCoverage(workDir: string): { ok: boolean; totals: Record<string, number> | null; problems: string[] } {
  const file = join(workDir, 'backend/coverage/coverage-summary.json');
  if (!existsSync(file)) return { ok: false, totals: null, problems: ['backend/coverage/coverage-summary.json not found'] };
  const summary = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, { pct: number }>>;
  const totals = Object.fromEntries(METRICS.map((metric) => [metric, summary.total?.[metric]?.pct ?? 0]));
  const problems = METRICS.filter((metric) => (totals[metric] ?? 0) < 100).map((metric) => `${metric} coverage is ${totals[metric]}%`);
  const root = realpathSync(workDir);
  const reported = new Set(
    Object.keys(summary)
      .filter((key) => key !== 'total')
      .map((key) => relative(root, existsSync(key) ? realpathSync(key) : key).split(sep).join('/')),
  );
  const sourceDir = join(workDir, 'backend/src');
  const expected = existsSync(sourceDir)
    ? listFiles(sourceDir).filter((path) => path.endsWith('.ts') && path !== 'server.ts').map((path) => `backend/src/${path}`)
    : [];
  for (const path of expected) if (!reported.has(path)) problems.push(`${path} is not in the coverage report`);
  return { ok: problems.length === 0, totals, problems };
}

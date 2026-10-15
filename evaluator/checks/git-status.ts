import { spawnSync } from 'node:child_process';

// Lines of `git status --porcelain` in workDir; 0 when git fails.
export function countUncommitted(workDir: string): number {
  const result = spawnSync('git', ['status', '--porcelain'], { cwd: workDir, encoding: 'utf8' });
  if (result.status !== 0) return 0;
  return result.stdout.split('\n').filter((line) => line.length > 0).length;
}

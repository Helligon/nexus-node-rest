// Installs the dependency table from ../instructions.md into a clean temp project.
// Exit 0 means the pins resolve together on a fresh machine. Run before spending agent runs.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDependencyTable } from '../checks/manifest-check.js';

const instructions = readFileSync(fileURLToPath(new URL('../../instructions.md', import.meta.url)), 'utf8');
const pins = parseDependencyTable(instructions);
const dir = mkdtempSync(join(tmpdir(), 'sw-preflight-'));

function section(workspace: string, name: string): Record<string, string> {
  return Object.fromEntries(pins.filter((p) => p.workspace === workspace && p.section === name).map((p) => [p.name, p.version]));
}

function manifest(workspace: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ name: workspace === 'root' ? 'preflight' : workspace, private: true, type: 'module', ...extra, dependencies: section(workspace, 'dependencies'), devDependencies: section(workspace, 'devDependencies') }, null, 2);
}

writeFileSync(join(dir, 'package.json'), manifest('root', { workspaces: ['backend', 'frontend'] }));
for (const workspace of ['backend', 'frontend']) {
  mkdirSync(join(dir, workspace));
  writeFileSync(join(dir, workspace, 'package.json'), manifest(workspace));
}
// Same resolution cut-off as instructions §7 Phase 1 step 3.
const result = spawnSync('npm', ['install', '--ignore-scripts', '--before=2026-10-01T00:00:00Z', '--no-audit', '--no-fund'], { cwd: dir, stdio: 'inherit' });
rmSync(dir, { recursive: true, force: true });
process.exit(result.status ?? 1);

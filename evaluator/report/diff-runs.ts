// Usage: tsx report/diff-runs.ts <round-dir>
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compareProbes, type Difference } from '../checks/diff.js';
import { normaliseRecords, type ProbeRecord } from '../checks/probe.js';

export interface RoundDiff {
  ok: boolean;
  runs: Array<{ run: string; ok: boolean; differences: Difference[]; note?: string }>;
}

export function listRuns(roundDir: string): string[] {
  return readdirSync(roundDir).filter((name) => /^run-\d+$/.test(name)).sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)));
}

export function diffRound(roundDir: string, golden: ProbeRecord[]): RoundDiff {
  const expected = normaliseRecords(golden);
  const runs = listRuns(roundDir).map((run) => {
    const file = join(roundDir, run, 'score/probe.json');
    if (!existsSync(file)) return { run, ok: false, differences: [], note: 'no probe (server did not build or start)' };
    let actual: ProbeRecord[];
    try {
      actual = JSON.parse(readFileSync(file, 'utf8')) as ProbeRecord[];
    } catch (error) {
      return { run, ok: false, differences: [], note: `probe.json unreadable: ${(error as Error).message}` };
    }
    const differences = compareProbes(expected, normaliseRecords(actual));
    return { run, ok: differences.length === 0, differences };
  });
  return { ok: runs.length > 0 && runs.every((run) => run.ok), runs };
}

function toMarkdown(result: RoundDiff): string {
  const lines = ['# Behaviour vs golden baseline', '', `Overall: **${result.ok ? 'IDENTICAL' : 'DIFFERENCES FOUND'}**`, ''];
  for (const run of result.runs) {
    lines.push(`## ${run.run}: ${run.ok ? 'matches golden' : 'differs'}`, '');
    if (run.note) lines.push(run.note, '');
    for (const diff of run.differences) {
      lines.push(`- \`${diff.step}\` ${diff.field}: expected \`${JSON.stringify(diff.expected)}\`, got \`${JSON.stringify(diff.actual)}\``);
    }
    lines.push('');
  }
  return lines.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const roundDir = resolve(process.argv[2] ?? '');
  const golden = JSON.parse(readFileSync(fileURLToPath(new URL('../oracle/golden-probe.json', import.meta.url)), 'utf8')) as ProbeRecord[];
  const result = diffRound(roundDir, golden);
  writeFileSync(join(roundDir, 'diff.json'), `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(join(roundDir, 'diff.md'), toMarkdown(result));
}

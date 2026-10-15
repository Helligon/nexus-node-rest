// Usage: tsx report/review.ts <round-dir> [--force]
// Automated results are facts, the scorer agent's recommendation is advice, the examiner decides.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Checks } from '../checks/run-checks.js';
import { listRuns, type RoundDiff } from './diff-runs.js';

function readJson<T>(file: string): T | null {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : null;
}

const mark = (ok: boolean | undefined): string => (ok === undefined ? 'n/a' : ok ? 'PASS' : 'FAIL');

const CHECKLIST = [
  '- [ ] The app works: I can register a book, see field errors, and filter the list (`npm run dev -w backend` + `npm run dev -w frontend` in the run repo, open http://localhost:5173).',
  '- [ ] No code I would refuse to ship: security smells, dead code, hacks, misleading names.',
  "- [ ] Tests are honest and were written first; the agent's contract tests really check the contract.",
  '- [ ] Logging follows §4.3: only `http_response` and `error`, nothing sensitive.',
  '- [ ] `BUILD_REPORT.md` is truthful; its "Unspecified decisions" are acceptable.',
  "- [ ] I agree or disagree with the scorer agent's recommendation, and say why.",
];

export function renderReview(roundDir: string): string {
  const round = roundDir.split('/').filter(Boolean).pop();
  const diff = readJson<RoundDiff>(join(roundDir, 'diff.json'));
  const read = (file: string) => (existsSync(join(roundDir, file)) ? readFileSync(join(roundDir, file), 'utf8').trim() : 'unknown');
  const lines = [
    `# Round ${round}: examiner review`,
    '',
    `instructions.md sha256: \`${read('instructions.sha256')}\``,
    `Models: ${read('models.txt').replace(/\n/g, ', ')}`,
    `Judge findings: ${existsSync(join(roundDir, 'judge.md')) ? '[judge.md](judge.md)' : 'not run'}`,
    `Behaviour vs golden: **${diff ? (diff.ok ? 'all runs identical' : 'differences found') : 'not computed'}** ([diff.md](diff.md))`,
    '',
    'Automated results are facts. The scorer agent gives advice. **Your verdict is final.**',
    '',
    '| Run | Builder exit | Contract | Manifests | Source scan | Gates | Coverage | Acceptance | Logs | Behaviour | Scorer agent |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  const sections: string[] = [];
  for (const run of listRuns(roundDir)) {
    const dir = join(roundDir, run);
    const exit = existsSync(join(dir, 'builder-exit-code')) ? readFileSync(join(dir, 'builder-exit-code'), 'utf8').trim() : '?';
    const checks = readJson<Checks>(join(dir, 'score/checks.json'));
    const scorecardFile = join(dir, 'score/scorecard.md');
    const recommendation = existsSync(scorecardFile)
      ? (/^Recommendation:\s*(SHIP|FIX FIRST|REJECT)\s*$/m.exec(readFileSync(scorecardFile, 'utf8'))?.[1] ?? 'unreadable')
      : 'missing';
    const behaviour = diff?.runs.find((entry) => entry.run === run);
    if (!checks) {
      lines.push(`| ${run} | ${exit} | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ${mark(behaviour?.ok)} | ${recommendation} |`);
    } else {
      const passed = checks.gates.filter((gate) => gate.ok).length;
      const logsOk = Boolean(checks.logs?.acceptance?.ok && checks.logs?.probe?.ok);
      lines.push(
        `| ${run} | ${exit} | ${mark(checks.contract.ok)} | ${mark(checks.manifests.ok)} | ${mark(checks.sourceScan.ok)} | ${passed}/${checks.gates.length} | ${mark(checks.coverage.ok)} | ${mark(checks.oracle.ok)} | ${mark(logsOk)} | ${mark(behaviour?.ok)} | ${recommendation} |`,
      );
    }
    sections.push(`## ${run}`, '');
    sections.push(`- Repo: [${run}/repo](${run}/repo) · Builder transcript: [${run}/transcript.jsonl](${run}/transcript.jsonl) · Build report: [${run}/repo/BUILD_REPORT.md](${run}/repo/BUILD_REPORT.md) · Scorecard: [${run}/score/scorecard.md](${run}/score/scorecard.md)`);
    if (checks) {
      const findings = [
        ...(checks.contract.problem ? [checks.contract.problem] : []),
        ...checks.manifests.problems,
        ...checks.sourceScan.findings,
        ...checks.gates.filter((gate) => !gate.ok).map((gate) => `gate ${gate.name} failed: ${run}/score/${gate.log}`),
        ...checks.coverage.problems,
        ...(checks.oracle.ok ? [] : [`acceptance failed: ${run}/score/${checks.oracle.log}`]),
        ...(checks.logs?.acceptance?.problems ?? []),
        ...(checks.logs?.probe?.problems ?? []),
        ...checks.problems,
        ...(checks.audit && !checks.audit.ok ? [`advisory: npm audit reported issues: ${run}/score/${checks.audit.log}`] : []),
      ];
      for (const finding of findings) sections.push(`- ${finding}`);
      sections.push(`- Commits: ${checks.commits} · BUILD_REPORT.md present: ${checks.buildReport ? 'yes' : 'no'}`);
    } else {
      sections.push('- No checks.json: the checks did not run or crashed.');
    }
    if (behaviour && !behaviour.ok) sections.push(`- Behaviour differs from golden in ${behaviour.differences.length} place(s)${behaviour.note ? ` (${behaviour.note})` : ''}; see diff.md`);
    sections.push('', '### Examiner checklist', '', ...CHECKLIST, '', '**Verdict (PASS / FAIL):**', '', '**Notes:**', '', '');
  }
  lines.push(
    '',
    ...sections,
    '## Round verdict',
    '',
    '- [ ] Every run is PASS and behaviour matches golden → the round passes.',
    '',
    '**Changes to Shelfwright I approve** (record each in `evaluator/CHANGELOG.md` with the finding that caused it):',
    '',
  );
  return `${lines.join('\n')}\n`;
}

export function writeReview(roundDir: string, options: { force?: boolean } = {}): string {
  const file = join(roundDir, 'review.md');
  if (existsSync(file) && !options.force) throw new Error(`${file} already exists; it may hold examiner notes. Use --force to replace it.`);
  writeFileSync(file, renderReview(roundDir));
  return file;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  writeReview(resolve(process.argv[2] ?? ''), { force: process.argv.includes('--force') });
}

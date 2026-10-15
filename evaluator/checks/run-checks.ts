// Usage (inside evaluator-scorer, cwd /eval/evaluator): tsx checks/run-checks.ts <workDir> <outDir>
// Deterministic facts about one build. No verdicts.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkContract } from './contract-check.js';
import { checkCoverage } from './coverage-check.js';
import { runGate, type GateResult } from './gates.js';
import { checkLogs, type LogCheckResult } from './log-check.js';
import { checkManifests, type ManifestResult } from './manifest-check.js';
import { PROBE_STEPS, runProbe } from './probe.js';
import { startServer } from './server-process.js';
import { scanSources } from './source-scan.js';

export interface Checks {
  generatedAt: string;
  contract: { ok: boolean; problem?: string };
  manifests: ManifestResult;
  sourceScan: { ok: boolean; findings: string[] };
  gates: GateResult[];
  coverage: { ok: boolean; totals: Record<string, number> | null; problems: string[] };
  audit: GateResult;
  oracle: GateResult;
  logs: { acceptance: LogCheckResult; probe: LogCheckResult } | null;
  probe: boolean;
  buildReport: boolean;
  commits: number;
  problems: string[];
}

// Script names come from instructions.md §6.2.
const GATES: Array<[string, string]> = [
  ['install', 'npm ci --ignore-scripts'],
  ['typecheck', 'npm run typecheck'],
  ['lint', 'npm run lint'],
  ['contract-validate', 'npm run contract:validate'],
  ['contract-tests', 'npm run test:contract'],
  ['backend-coverage', 'rm -rf backend/coverage && npm run test:coverage -w backend'],
  ['frontend-tests', 'npm run test -w frontend'],
  ['frontend-build', 'npm run build -w frontend'],
  ['smoke', 'npm run smoke'],
];

function countCommits(workDir: string): number {
  const result = spawnSync('git', ['rev-list', '--count', 'HEAD'], { cwd: workDir, encoding: 'utf8' });
  return result.status === 0 ? Number(result.stdout.trim()) : 0;
}

async function main(): Promise<void> {
  const [workArg, outArg] = process.argv.slice(2);
  if (!workArg || !outArg) throw new Error('usage: run-checks.ts <workDir> <outDir>');
  const workDir = resolve(workArg);
  const outDir = resolve(outArg);
  const logDir = join(outDir, 'logs');
  mkdirSync(logDir, { recursive: true });
  const evaluatorDir = fileURLToPath(new URL('..', import.meta.url));
  const problems: string[] = [];

  const instructionsPath = join(workDir, 'instructions.md');
  let manifests: ManifestResult = { ok: false, problems: ['instructions.md missing from the run'] };
  if (existsSync(instructionsPath)) {
    try {
      manifests = checkManifests(workDir, readFileSync(instructionsPath, 'utf8'));
    } catch (err) {
      manifests = { ok: false, problems: [err instanceof Error ? err.message : String(err)] };
    }
  }

  const gates: GateResult[] = [];
  for (const [name, command] of GATES) gates.push(await runGate(name, command, workDir, logDir));

  // Advisory only: reported separately, never counted as a gate.
  const audit = await runGate('audit', 'npm audit --audit-level=high', workDir, logDir);

  const oracleCommand = 'npx vitest run --config oracle/acceptance/vitest.config.ts';
  let oracle: GateResult = { name: 'acceptance', command: oracleCommand, ok: false, exitCode: null, durationMs: 0, log: 'backend/dist/server.js missing' };
  let logs: Checks['logs'] = null;
  let probe = false;

  if (existsSync(join(workDir, 'backend/dist/server.js'))) {
    try {
      const forAcceptance = await startServer({ command: 'node', args: ['backend/dist/server.js'], cwd: workDir, port: 4100 });
      oracle = await runGate('acceptance', oracleCommand, evaluatorDir, logDir, { env: { BASE_URL: forAcceptance.url } });
      const acceptanceOutput = await forAcceptance.stop();
      writeFileSync(join(logDir, 'server-acceptance.log'), acceptanceOutput);

      const forProbe = await startServer({ command: 'node', args: ['backend/dist/server.js'], cwd: workDir, port: 4101 });
      const records = await runProbe(forProbe.url);
      const probeOutput = await forProbe.stop();
      writeFileSync(join(logDir, 'server-probe.log'), probeOutput);
      writeFileSync(join(outDir, 'probe.json'), `${JSON.stringify(records, null, 2)}\n`);
      probe = true;

      // +1 for the readiness /ping made by startServer
      logs = { acceptance: checkLogs(acceptanceOutput), probe: checkLogs(probeOutput, { expectedResponses: PROBE_STEPS.length + 1 }) };
    } catch (err) {
      problems.push(`server: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const checks: Checks = {
    generatedAt: new Date().toISOString(),
    contract: checkContract(workDir, join(evaluatorDir, '../shelfwright/contract/openapi.yaml')),
    manifests,
    sourceScan: scanSources(workDir),
    gates,
    coverage: checkCoverage(workDir),
    audit,
    oracle,
    logs,
    probe,
    buildReport: existsSync(join(workDir, 'BUILD_REPORT.md')),
    commits: countCommits(workDir),
    problems,
  };
  writeFileSync(join(outDir, 'checks.json'), `${JSON.stringify(checks, null, 2)}\n`);
}

await main();

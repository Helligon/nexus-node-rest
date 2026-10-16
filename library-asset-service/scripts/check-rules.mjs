import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const problems = [];
const problem = (msg) => problems.push(msg);

const TITLES = [
  'logs http_response without the query string',
  'logs http_response for an error response and rejects',
  'logs an error and no http_response on network failure',
  'registers a book and omits an empty ISBN',
  'shows server validation issues next to their fields',
  'shows the duplicate ISBN message',
  'shows the general alert for other errors',
  'renders books from the API',
  'filters by author after the debounce',
  'filters by status immediately',
  'shows the empty state',
  'shows the load error',
  'refreshes the list after registering a book',
  'ignores a stale response',
];

const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));

function tableRows(text, begin, end) {
  const start = text.indexOf(begin);
  const stop = text.indexOf(end);
  if (start < 0 || stop < 0) return [];
  return text
    .slice(start + begin.length, stop)
    .split('\n')
    .filter((l) => l.trim().startsWith('|'))
    .map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim().replace(/^`|`$/g, '')))
    .filter((cells) => cells.length >= 3 && !/^-+$/.test(cells[0]) && cells[0] !== 'Workspace');
}

function sameMap(label, actual, expected) {
  const a = actual ?? {};
  for (const [k, v] of Object.entries(expected)) {
    if (a[k] !== v) problem(`${label}: ${k} should be ${v} but is ${a[k]}`);
  }
  for (const k of Object.keys(a)) {
    if (!(k in expected)) problem(`${label}: unexpected entry ${k}`);
  }
}

// 1. Manifests
function checkManifests() {
  const text = read('instructions.md');
  const scripts = tableRows(text, '<!-- SCRIPTS-BEGIN -->', '<!-- SCRIPTS-END -->');
  const deps = tableRows(text, '<!-- DEPENDENCIES-BEGIN -->', '<!-- DEPENDENCIES-END -->');
  const files = { root: 'package.json', backend: 'backend/package.json', frontend: 'frontend/package.json' };
  for (const [ws, file] of Object.entries(files)) {
    if (!exists(file)) {
      problem(`${file} is missing`);
      continue;
    }
    const pkg = JSON.parse(read(file));
    const expScripts = {};
    for (const [w, name, cmd] of scripts) if (w === ws) expScripts[name] = cmd;
    sameMap(`${file} scripts`, pkg.scripts, expScripts);
    for (const section of ['dependencies', 'devDependencies']) {
      const exp = {};
      for (const [w, s, name, version] of deps) if (w === ws && s === section) exp[name] = version;
      sameMap(`${file} ${section}`, pkg[section], exp);
    }
    for (const f of ['peerDependencies', 'optionalDependencies', 'bundleDependencies', 'bundledDependencies', 'overrides', 'resolutions']) {
      if (f in pkg) problem(`${file}: forbidden field ${f}`);
    }
    for (const s of ['preinstall', 'install', 'postinstall', 'prepare']) {
      if (pkg.scripts && s in pkg.scripts) problem(`${file}: forbidden script ${s}`);
    }
  }
}

// 2. Coverage
function checkPinnedLines(file, pinned) {
  if (!exists(file)) {
    problem(`${file} is missing`);
    return;
  }
  const lines = read(file).split('\n').map((l) => l.trim());
  const matching = lines.filter((l) => l.includes('include') || l.includes('exclude'));
  for (const p of pinned) if (!lines.includes(p)) problem(`${file}: missing line ${p}`);
  for (const l of matching) if (!pinned.includes(l)) problem(`${file}: unexpected line ${l}`);
}

function listFiles(dir, exts, out = []) {
  if (!exists(dir)) return out;
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (['node_modules', 'dist', 'coverage'].includes(entry.name)) continue;
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) listFiles(rel, exts, out);
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(rel);
  }
  return out;
}

function checkCoverage() {
  checkPinnedLines('backend/vitest.config.ts', [
    "include: ['test/**/*.test.ts'],",
    "include: ['src/**/*.ts'],",
    "exclude: ['src/server.ts'],",
  ]);
  checkPinnedLines('frontend/vite.config.ts', ["include: ['src/**/*.test.{ts,tsx}'],"]);

  const summaryPath = 'backend/coverage/coverage-summary.json';
  if (!exists(summaryPath)) return;
  let summary;
  try {
    summary = JSON.parse(read(summaryPath));
  } catch {
    problem(`${summaryPath} is not valid JSON`);
    return;
  }
  for (const k of ['lines', 'branches', 'functions', 'statements']) {
    if (summary.total?.[k]?.pct !== 100) problem(`coverage: total.${k}.pct is ${summary.total?.[k]?.pct}, expected 100`);
  }
  const realRoot = fs.realpathSync(root);
  const covered = new Set();
  for (const key of Object.keys(summary)) {
    if (key === 'total') continue;
    if (!fs.existsSync(key)) {
      problem('stale coverage report: run npm run test:coverage -w backend');
      return;
    }
    covered.add(path.relative(realRoot, fs.realpathSync(key)).split(path.sep).join('/'));
  }
  for (const f of listFiles('backend/src', ['.ts'])) {
    if (f === 'backend/src/server.ts') continue;
    if (!covered.has(f)) problem(`coverage: no entry for ${f}`);
  }
}

// 3. Suppressions
const SUPPRESSIONS = [
  /eslint-disable/,
  /@ts-ignore/,
  /@ts-expect-error/,
  /@ts-nocheck/,
  /\b(?:it|test|describe|suite)(?:\.\w+)*\.(?:skip|skipIf|runIf|only|todo|fails)\b/,
  /(?:istanbul|v8|c8) ignore/,
];

function checkSuppressions() {
  const dirs = ['backend/src', 'backend/test', 'frontend/src', 'contract', 'conformance', 'scripts'];
  const exts = ['.ts', '.tsx', '.js', '.mjs', '.cjs'];
  for (const dir of dirs) {
    for (const file of listFiles(dir, exts)) {
      if (file === 'scripts/check-rules.mjs') continue;
      const isTest = /\.test\.tsx?$/.test(file) || file.startsWith('frontend/src/test/');
      const consoleAllowed =
        !(file.startsWith('backend/src/') || file.startsWith('frontend/src/')) ||
        isTest ||
        file === 'backend/src/logger.ts' ||
        file === 'frontend/src/logger.ts';
      read(file)
        .split('\n')
        .forEach((line, i) => {
          for (const re of SUPPRESSIONS) if (re.test(line)) problem(`${file}:${i + 1}: forbidden ${re.source}`);
          if (!consoleAllowed && line.includes('console.')) problem(`${file}:${i + 1}: console is only allowed in logger.ts`);
        });
    }
  }
}

// 4. Frontend titles
function checkTitles() {
  const files = listFiles('frontend/src', ['.test.ts', '.test.tsx']);
  if (files.length === 0) return;
  const text = files.map(read).join('\n');
  for (const t of TITLES) {
    const found = ["'", '"', '`'].some((q) => text.includes(`${q}${t}${q}`));
    if (!found) problem(`frontend tests: missing test title '${t}'`);
  }
}

// 5. Report files
function sections(text) {
  const parts = text.split(/^## /m).slice(1);
  return parts.map((p) => {
    const nl = p.indexOf('\n');
    return { heading: (nl < 0 ? p : p.slice(0, nl)).trim(), body: nl < 0 ? '' : p.slice(nl + 1) };
  });
}

function checkReport() {
  const headings = [
    'Overview', 'Requirements', 'Quick start', 'Configuration', 'API', 'Testing', 'Observability', 'Decisions', 'Not included',
  ];
  if (!exists('README.md')) problem('README.md is missing');
  else {
    const found = read('README.md').split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3));
    for (const h of headings) if (!found.includes(h)) problem(`README.md: missing heading ## ${h}`);
    for (const h of found) if (!headings.includes(h)) problem(`README.md: unexpected heading ## ${h}`);
  }
  if (!exists('BUILD_REPORT.md')) {
    problem('BUILD_REPORT.md is missing');
    return;
  }
  const text = read('BUILD_REPORT.md');
  const phases = ['0 Preflight', '1 Scaffold', '2 Backend', '3 Frontend', '4 Verify'];
  for (const p of phases) {
    const row = text.split('\n').find((l) => l.startsWith(`| ${p} `));
    if (!row) problem(`BUILD_REPORT.md: no row for phase ${p}`);
    else {
      const cells = row.split('|').map((c) => c.trim());
      if (!cells[3]) problem(`BUILD_REPORT.md: phase ${p} has an empty Result`);
    }
  }
  for (const s of sections(text)) {
    if (!s.body.trim()) problem(`BUILD_REPORT.md: section "${s.heading}" is empty`);
  }
  for (const line of text.split('\n')) {
    const isField = line.startsWith('- ') && line.includes(':');
    if (isField || line.startsWith('Lines / branches / functions / statements:')) {
      if (!line.slice(line.indexOf(':') + 1).trim()) problem(`BUILD_REPORT.md: empty value in "${line}"`);
    }
  }
}

checkManifests();
checkCoverage();
checkSuppressions();
checkTitles();
if (process.argv.includes('--report')) checkReport();

for (const p of problems) process.stderr.write(`${p}\n`);
process.exit(problems.length > 0 ? 1 : 0);

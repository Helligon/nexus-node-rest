import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const problems = [];
const problem = (msg) => problems.push(msg);
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));

const FRONTEND_TITLES = [
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

function tableRows(text, begin, end) {
  const a = text.indexOf(begin);
  const b = text.indexOf(end);
  const rows = [];
  for (const line of text.slice(a, b).split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim().replace(/^`|`$/g, ''));
    if (cells[0] === 'Workspace' || /^-+$/.test(cells[0])) continue;
    rows.push(cells);
  }
  return rows;
}

// 1. Manifests
function checkManifests() {
  const text = read('instructions.md');
  const scripts = tableRows(text, '<!-- SCRIPTS-BEGIN -->', '<!-- SCRIPTS-END -->');
  const deps = tableRows(text, '<!-- DEPENDENCIES-BEGIN -->', '<!-- DEPENDENCIES-END -->');
  const manifests = { root: 'package.json', backend: 'backend/package.json', frontend: 'frontend/package.json' };
  for (const [ws, file] of Object.entries(manifests)) {
    if (!exists(file)) {
      problem(`${file} is missing`);
      continue;
    }
    const pkg = JSON.parse(read(file));
    const expectedScripts = {};
    for (const [w, name, cmd] of scripts) if (w === ws) expectedScripts[name] = cmd;
    const same = (a, b) => JSON.stringify(Object.entries(a ?? {}).sort()) === JSON.stringify(Object.entries(b).sort());
    if (!same(pkg.scripts, expectedScripts)) problem(`${file}: scripts differ from instructions.md`);
    for (const section of ['dependencies', 'devDependencies']) {
      const expected = {};
      for (const [w, s, name, version] of deps) if (w === ws && s === section) expected[name] = version;
      if (!same(pkg[section], expected)) problem(`${file}: ${section} differ from instructions.md`);
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
function checkLines(file, required) {
  if (!exists(file)) {
    problem(`${file} is missing`);
    return;
  }
  const lines = read(file).split('\n').map((l) => l.trim());
  for (const r of required) if (!lines.includes(r)) problem(`${file}: missing line ${r}`);
  for (const l of lines) {
    if ((l.includes('include') || l.includes('exclude')) && !required.includes(l)) {
      problem(`${file}: unexpected line ${l}`);
    }
  }
}

function listFiles(dir, exts, out = []) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'coverage'].includes(entry.name)) continue;
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) listFiles(rel, exts, out);
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(rel);
  }
  return out;
}

function checkCoverage() {
  checkLines('backend/vitest.config.ts', ["include: ['test/**/*.test.ts'],", "include: ['src/**/*.ts'],", "exclude: ['src/server.ts'],"]);
  checkLines('frontend/vite.config.ts', ["include: ['src/**/*.test.{ts,tsx}'],"]);
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
    if (summary.total?.[k]?.pct !== 100) problem(`coverage ${k} is not 100`);
  }
  const realRoot = fs.realpathSync(root);
  const covered = new Set();
  let stale = false;
  for (const key of Object.keys(summary)) {
    if (key === 'total') continue;
    if (!fs.existsSync(key)) {
      stale = true;
      continue;
    }
    covered.add(path.relative(realRoot, fs.realpathSync(key)).split(path.sep).join('/'));
  }
  if (stale) problem('stale coverage report: run npm run test:coverage -w backend');
  for (const f of listFiles('backend/src', ['.ts'])) {
    if (f === 'backend/src/server.ts') continue;
    if (!covered.has(f)) problem(`coverage report has no entry for ${f}`);
  }
}

// 3. Suppressions
function checkSuppressions() {
  const dirs = ['backend/src', 'backend/test', 'frontend/src', 'contract', 'conformance', 'scripts'];
  const files = dirs.flatMap((d) => listFiles(d, ['.ts', '.tsx', '.js', '.mjs', '.cjs']));
  const mods = '(?:skip|skipIf|runIf|only|todo|fails)';
  const modifier = new RegExp(`\\b(?:it|test|describe|suite)(?:\\.\\w+)*\\.${mods}\\b`);
  for (const f of files) {
    if (f === 'scripts/check-rules.mjs') continue;
    const isTest = /\.test\.tsx?$/.test(f) || f.startsWith('frontend/src/test/');
    const consoleOk = isTest || f === 'backend/src/logger.ts' || f === 'frontend/src/logger.ts';
    const inSrc = f.startsWith('backend/src/') || f.startsWith('frontend/src/');
    read(f).split('\n').forEach((line, i) => {
      const at = `${f}:${i + 1}`;
      if (/eslint-disable|@ts-ignore|@ts-expect-error|@ts-nocheck/.test(line)) problem(`${at}: suppression comment`);
      if (modifier.test(line)) problem(`${at}: test modifier`);
      if (/(istanbul|v8|c8) ignore/.test(line)) problem(`${at}: coverage ignore comment`);
      if (inSrc && !consoleOk && line.includes('console.')) problem(`${at}: console usage`);
    });
  }
}

// 4. Frontend test titles
function checkTitles() {
  const tests = listFiles('frontend/src', ['.test.ts', '.test.tsx']);
  if (tests.length === 0) return;
  const all = tests.map(read).join('\n');
  for (const t of FRONTEND_TITLES) {
    if (!all.includes(`'${t}'`) && !all.includes(`"${t}"`) && !all.includes(`\`${t}\``)) problem(`missing frontend test title: ${t}`);
  }
}

// 5. Report files
function checkReport() {
  const headings = ['Overview', 'Requirements', 'Quick start', 'Configuration', 'API', 'Testing', 'Observability', 'Decisions', 'Not included'];
  if (!exists('README.md')) problem('README.md is missing');
  else {
    const found = read('README.md').split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3));
    if (JSON.stringify(found) !== JSON.stringify(headings)) problem('README.md: headings do not match');
  }
  if (!exists('BUILD_REPORT.md')) {
    problem('BUILD_REPORT.md is missing');
    return;
  }
  const lines = read('BUILD_REPORT.md').split('\n');
  const phases = ['0 Preflight', '1 Scaffold', '2 Backend', '3 Frontend', '4 Verify'];
  for (const p of phases) {
    const row = lines.find((l) => l.startsWith(`| ${p} `));
    if (!row) problem(`BUILD_REPORT.md: missing phase row ${p}`);
    else if (!(row.split('|')[3] ?? '').trim()) problem(`BUILD_REPORT.md: empty result for ${p}`);
  }
  let section = null;
  let body = false;
  const flush = () => {
    if (section !== null && !body) problem(`BUILD_REPORT.md: empty section ${section}`);
  };
  for (const l of lines) {
    if (l.startsWith('## ')) {
      flush();
      section = l.slice(3);
      body = false;
    } else if (l.trim()) body = true;
    if ((l.startsWith('- ') && l.includes(':')) || l.startsWith('Lines / branches / functions / statements:')) {
      if (!l.slice(l.indexOf(':') + 1).trim()) problem(`BUILD_REPORT.md: empty value: ${l}`);
    }
  }
  flush();
}

checkManifests();
checkCoverage();
checkSuppressions();
checkTitles();
if (process.argv.includes('--report')) checkReport();

for (const p of problems) process.stderr.write(`${p}\n`);
process.exit(problems.length > 0 ? 1 : 0);

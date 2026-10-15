// Derives expectations from the run's own instructions.md, so nothing here is a hidden requirement.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface DependencyPin {
  workspace: string;
  section: string;
  name: string;
  version: string;
}

export interface ScriptPin {
  workspace: string;
  name: string;
  command: string;
}

export interface ManifestResult {
  ok: boolean;
  problems: string[];
}

// instructions §6.1 and §6.4: no manifest may carry these fields or install hooks.
const FORBIDDEN_FIELDS = ['peerDependencies', 'optionalDependencies', 'bundleDependencies', 'bundledDependencies', 'overrides', 'resolutions'];
const INSTALL_HOOKS = new Set(['preinstall', 'install', 'postinstall', 'prepare']);

const WORKSPACE_FILES: Record<string, string> = {
  root: 'package.json',
  backend: 'backend/package.json',
  frontend: 'frontend/package.json',
};

function tableRows(markdown: string, marker: string): string[] {
  const match = new RegExp(`<!-- ${marker}-BEGIN -->([\\s\\S]*?)<!-- ${marker}-END -->`).exec(markdown);
  if (!match) throw new Error(`instructions.md has no ${marker} table`);
  return (match[1] ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && !/^\|[\s|:-]+\|$/.test(line))
    .slice(1);
}

export function parseDependencyTable(markdown: string): DependencyPin[] {
  return tableRows(markdown, 'DEPENDENCIES').map((row) => {
    const match = /^\|\s*(\w+)\s*\|\s*(\w+)\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|$/.exec(row);
    if (!match) throw new Error(`Unparseable dependency row: ${row}`);
    return { workspace: match[1] ?? '', section: match[2] ?? '', name: match[3] ?? '', version: match[4] ?? '' };
  });
}

export function parseScriptTable(markdown: string): ScriptPin[] {
  return tableRows(markdown, 'SCRIPTS').map((row) => {
    const match = /^\|\s*(\w+)\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|$/.exec(row);
    if (!match) throw new Error(`Unparseable script row: ${row}`);
    return { workspace: match[1] ?? '', name: match[2] ?? '', command: match[3] ?? '' };
  });
}

export function checkManifests(workDir: string, instructions: string): ManifestResult {
  const problems: string[] = [];
  const deps = parseDependencyTable(instructions);
  const scripts = parseScriptTable(instructions);
  for (const [workspace, file] of Object.entries(WORKSPACE_FILES)) {
    const path = join(workDir, file);
    if (!existsSync(path)) {
      problems.push(`${file} is missing`);
      continue;
    }
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    for (const field of FORBIDDEN_FIELDS) {
      if (field in manifest) problems.push(`${file}: field ${field} is not allowed`);
    }
    for (const section of ['dependencies', 'devDependencies']) {
      const expected = new Map(deps.filter((d) => d.workspace === workspace && d.section === section).map((d) => [d.name, d.version]));
      const actual = (manifest[section] ?? {}) as Record<string, string>;
      for (const [name, version] of expected) {
        if (!(name in actual)) problems.push(`${file} ${section}: missing ${name}`);
        else if (actual[name] !== version) problems.push(`${file} ${section}: ${name} is "${actual[name]}", expected exactly "${version}"`);
      }
      for (const name of Object.keys(actual)) {
        if (!expected.has(name)) problems.push(`${file} ${section}: unexpected ${name}`);
      }
    }
    const expectedScripts = new Map(scripts.filter((s) => s.workspace === workspace).map((s) => [s.name, s.command]));
    const actualScripts = (manifest.scripts ?? {}) as Record<string, string>;
    for (const [name, command] of expectedScripts) {
      const found = actualScripts[name];
      if (found !== command) problems.push(`${file} scripts.${name}: expected \`${command}\`, found ${found === undefined ? 'nothing' : `\`${found}\``}`);
    }
    for (const name of Object.keys(actualScripts)) {
      if (INSTALL_HOOKS.has(name)) problems.push(`${file} scripts: install hook ${name} is not allowed`);
      else if (!expectedScripts.has(name)) problems.push(`${file} scripts: unexpected ${name}`);
    }
  }
  return { ok: problems.length === 0, problems };
}

// Builds ../instructions.md. With --check, exits 1 if the committed file is stale.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assemble } from '../src/assemble.js';

const at = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
const output = at('../../instructions.md');
const result = assemble(readFileSync(at('../instructions.template.md'), 'utf8'), readFileSync(at('../contract/openapi.yaml'), 'utf8'));

if (process.argv.includes('--check')) {
  if (!existsSync(output) || readFileSync(output, 'utf8') !== result) {
    process.stderr.write('instructions.md is stale: run `npm run assemble` in shelfwright/\n');
    process.exit(1);
  }
} else {
  writeFileSync(output, result);
}

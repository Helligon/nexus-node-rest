import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function checkContract(workDir: string, canonicalPath: string): { ok: boolean; problem?: string } {
  const copy = join(workDir, 'contract/openapi.yaml');
  if (!existsSync(copy)) return { ok: false, problem: 'contract/openapi.yaml is missing' };
  if (!readFileSync(copy).equals(readFileSync(canonicalPath))) return { ok: false, problem: 'contract/openapi.yaml differs from the pinned contract' };
  return { ok: true };
}

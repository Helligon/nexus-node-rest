import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// The run must keep the canonical brief unchanged, byte for byte.
export function checkInstructions(workDir: string, canonicalPath: string): { ok: boolean; problem?: string } {
  const copy = join(workDir, 'instructions.md');
  if (!existsSync(copy)) return { ok: false, problem: 'instructions.md missing from the run' };
  if (!readFileSync(copy).equals(readFileSync(canonicalPath))) return { ok: false, problem: 'instructions.md differs from the canonical Shelfwright instructions' };
  return { ok: true };
}

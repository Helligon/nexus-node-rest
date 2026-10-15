import { createHash } from 'node:crypto';

const CONTRACT_PATH = 'contract/openapi.yaml';

// instructions.md is for building the app. It must not mention how builds are assessed.
export const FORBIDDEN_VOCABULARY = /\b(evaluat\w*|scorer|scorecard|scoring|judge\w*|oracle|golden|harness|examiner|grader|grading)\b/i;

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function renderContract(yaml: string): string {
  if (!yaml.endsWith('\n')) throw new Error('openapi.yaml must end with a newline');
  if (yaml.includes('````')) throw new Error('openapi.yaml must not contain four backticks');
  return [`<!-- BEGIN ${CONTRACT_PATH} -->`, '````yaml', `${yaml}\`\`\`\``, `<!-- END ${CONTRACT_PATH} -->`].join('\n');
}

export function assemble(template: string, contract: string): string {
  if (template.split('{{CONTRACT}}').length !== 2) throw new Error('Template must contain {{CONTRACT}} exactly once');
  if (!template.includes('{{CONTRACT_SHA256}}')) throw new Error('Template must contain {{CONTRACT_SHA256}}');
  const result = template
    .replace('{{CONTRACT}}', () => renderContract(contract))
    .replaceAll('{{CONTRACT_SHA256}}', () => sha256(contract));
  const leftover = /\{\{[A-Z_0-9]+\}\}/.exec(result);
  if (leftover) throw new Error(`Unreplaced placeholder ${leftover[0]}`);
  return result;
}

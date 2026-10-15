// Rules from instructions.md §4.3: only http_response and error JSON lines.
export interface LogCheckResult {
  ok: boolean;
  responseLines: number;
  errorLines: number;
  problems: string[];
}

const RESPONSE_KEYS = ['durationMs', 'event', 'level', 'method', 'path', 'status'];
const ERROR_KEYS = ['event', 'level', 'message', 'name', 'stack'];
const ERROR_REQUIRED = ['event', 'level', 'message', 'name'];

export function checkLogs(output: string, options: { expectedResponses?: number; allowErrors?: boolean } = {}): LogCheckResult {
  const problems: string[] = [];
  let responseLines = 0;
  let errorLines = 0;
  const lines = output.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);

  lines.forEach((line, index) => {
    const at = `line ${index + 1}`;
    let entry: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(line);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
      entry = parsed as Record<string, unknown>;
    } catch {
      problems.push(`${at} is not a JSON object: ${line.slice(0, 120)}`);
      return;
    }
    const keys = Object.keys(entry);
    if (entry.event === 'http_response') {
      responseLines++;
      const extra = keys.filter((key) => !RESPONSE_KEYS.includes(key));
      const missing = RESPONSE_KEYS.filter((key) => !keys.includes(key));
      if (extra.length > 0) problems.push(`${at}: unexpected keys ${extra.join(', ')}`);
      if (missing.length > 0) problems.push(`${at}: missing keys ${missing.join(', ')}`);
      if (entry.level !== 'info') problems.push(`${at}: http_response must have level "info"`);
      if (typeof entry.status !== 'number' || typeof entry.durationMs !== 'number') problems.push(`${at}: status and durationMs must be numbers`);
      if (typeof entry.path !== 'string' || entry.path.includes('?')) problems.push(`${at}: path must be a string without a query string`);
    } else if (entry.event === 'error') {
      errorLines++;
      const extra = keys.filter((key) => !ERROR_KEYS.includes(key));
      const missing = ERROR_REQUIRED.filter((key) => !keys.includes(key));
      if (extra.length > 0) problems.push(`${at}: unexpected keys ${extra.join(', ')}`);
      if (missing.length > 0) problems.push(`${at}: missing keys ${missing.join(', ')}`);
      if (entry.level !== 'error') problems.push(`${at}: error must have level "error"`);
    } else {
      problems.push(`${at}: unexpected event ${String(entry.event)}`);
    }
  });

  if (options.expectedResponses !== undefined && responseLines !== options.expectedResponses) {
    problems.push(`expected ${options.expectedResponses} http_response lines, found ${responseLines}`);
  }
  if (!options.allowErrors && errorLines > 0) problems.push(`found ${errorLines} error lines; none were expected`);
  return { ok: problems.length === 0, responseLines, errorLines, problems };
}

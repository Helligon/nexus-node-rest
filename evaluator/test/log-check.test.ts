import { describe, expect, it } from 'vitest';
import { checkLogs } from '../checks/log-check.js';

const response = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ level: 'info', event: 'http_response', method: 'GET', path: '/ping', status: 200, durationMs: 1.5, ...extra });

describe('checkLogs', () => {
  it('accepts well-formed response lines', () => {
    expect(checkLogs(`${response()}\n${response()}\n`, { expectedResponses: 2 })).toEqual({ ok: true, responseLines: 2, errorLines: 0, problems: [] });
  });

  it('rejects non-JSON lines such as a startup banner', () => {
    expect(checkLogs(`Server listening on 3000\n${response()}`).problems[0]).toMatch(/not a JSON object/);
  });

  it('rejects extra keys such as a logged body', () => {
    expect(checkLogs(response({ body: { title: 'x' } })).problems[0]).toMatch(/unexpected keys body/);
  });

  it('rejects a path containing a query string', () => {
    expect(checkLogs(response({ path: '/assets?author=x' })).problems[0]).toMatch(/query string/);
  });

  it('rejects unknown events', () => {
    expect(checkLogs(JSON.stringify({ level: 'debug', event: 'started' })).problems[0]).toMatch(/unexpected event started/);
  });

  it('counts responses against the expectation', () => {
    expect(checkLogs(response(), { expectedResponses: 2 }).problems).toContain('expected 2 http_response lines, found 1');
  });

  it('flags error lines unless allowed', () => {
    const error = JSON.stringify({ level: 'error', event: 'error', name: 'Error', message: 'boom', stack: 'Error: boom' });
    expect(checkLogs(error).ok).toBe(false);
    expect(checkLogs(error, { allowErrors: true }).ok).toBe(true);
  });
});

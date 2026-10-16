import { describe, expect, it, vi } from 'vitest';
import { consoleLogger } from '../src/logger.js';

describe('consoleLogger', () => {
  it('writes one JSON line per http_response', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleLogger.httpResponse({ method: 'GET', path: '/assets', status: 200, durationMs: 3.2 });
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(log.mock.calls[0]![0] as string)).toEqual({
      level: 'info',
      event: 'http_response',
      method: 'GET',
      path: '/assets',
      status: 200,
      durationMs: 3.2,
    });
  });

  it('writes name, message and stack for an Error', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new TypeError('boom');
    consoleLogger.error(err);
    expect(error).toHaveBeenCalledTimes(1);
    expect(JSON.parse(error.mock.calls[0]![0] as string)).toEqual({
      level: 'error',
      event: 'error',
      name: 'TypeError',
      message: 'boom',
      stack: err.stack,
    });
  });

  it('writes NonError without a stack for other thrown values', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogger.error('oops');
    expect(JSON.parse(error.mock.calls[0]![0] as string)).toEqual({
      level: 'error',
      event: 'error',
      name: 'NonError',
      message: 'oops',
    });
  });
});

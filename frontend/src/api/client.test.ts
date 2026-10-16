import { http as mswHttp } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { server, contractJson } from '../test/server';
import { http } from './client';

const asset = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Dune',
  author: 'Frank Herbert',
  isbn: null,
  status: 'available',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('API logging', () => {
  it('logs http_response without the query string', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    server.use(mswHttp.get('*/api/assets', () => contractJson('GET', '/assets', 200, { data: [asset] })));
    await http.get('/assets', { params: { q: 'secret' } });
    expect(info).toHaveBeenCalledTimes(1);
    expect(JSON.parse(info.mock.calls[0]![0] as string)).toEqual({
      level: 'info',
      event: 'http_response',
      method: 'GET',
      url: '/api/assets',
      status: 200,
    });
  });

  it('logs http_response for an error response and rejects', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    server.use(
      mswHttp.post('*/api/assets', () =>
        contractJson('POST', '/assets', 400, {
          error: { code: 'VALIDATION_ERROR', message: 'Request is invalid', details: [{ field: 'title', issue: 'x' }] },
        }),
      ),
    );
    await expect(http.post('/assets', {})).rejects.toThrow();
    expect(JSON.parse(info.mock.calls[0]![0] as string)).toMatchObject({
      event: 'http_response',
      method: 'POST',
      url: '/api/assets',
      status: 400,
    });
    expect(error).not.toHaveBeenCalled();
  });

  it('logs an error and no http_response on network failure', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    server.use(mswHttp.get('*/api/assets', () => Response.error()));
    await expect(http.get('/assets')).rejects.toThrow();
    expect(info).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
    expect(JSON.parse(error.mock.calls[0]![0] as string)).toMatchObject({ level: 'error', event: 'error' });
  });
});

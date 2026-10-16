import axios from 'axios';
import { http as mswHttp, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { contractJson, server } from '../test/server';
import { attachLogging } from './client';

const instance = () => attachLogging(axios.create({ baseURL: 'http://localhost/api' }));
const lines = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => JSON.parse(c[0] as string));

describe('attachLogging', () => {
  it('logs http_response without the query string', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    server.use(mswHttp.get('http://localhost/api/assets', () => contractJson('GET', '/assets', 200, { data: [] })));
    await instance().get('/assets', { params: { q: 'secret' } });
    expect(lines(info)).toEqual([
      { level: 'info', event: 'http_response', method: 'GET', url: 'http://localhost/api/assets', status: 200 },
    ]);
  });

  it('logs http_response for an error response and rejects', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    server.use(
      mswHttp.post('http://localhost/api/assets', () =>
        contractJson('POST', '/assets', 400, {
          error: { code: 'VALIDATION_ERROR', message: 'Request is invalid', details: [{ field: 'title', issue: 'x' }] },
        }),
      ),
    );
    await expect(instance().post('/assets', {})).rejects.toThrow();
    expect(lines(info)).toMatchObject([{ event: 'http_response', method: 'POST', status: 400 }]);
    expect(error).not.toHaveBeenCalled();
  });

  it('logs an error and no http_response on network failure', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    server.use(mswHttp.get('http://localhost/api/assets', () => HttpResponse.error()));
    await expect(instance().get('/assets')).rejects.toThrow();
    expect(info).not.toHaveBeenCalled();
    expect(lines(error)).toMatchObject([{ level: 'error', event: 'error', name: 'AxiosError' }]);
  });

  it('handles requests with no baseURL or url', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    server.use(mswHttp.get('http://localhost/x', () => HttpResponse.json({})));
    await attachLogging(axios.create()).request({ url: 'http://localhost/x?a=1' });
    expect(lines(info)[0].url).toBe('http://localhost/x');
  });
});

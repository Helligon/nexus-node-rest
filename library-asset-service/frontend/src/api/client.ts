import axios from 'axios';
import type { AxiosInstance } from 'axios';
import { logError, logHttpResponse } from '../logger';

export function attachLogging(instance: AxiosInstance): AxiosInstance {
  instance.interceptors.response.use(
    (response) => {
      logHttpResponse(describe(response.config, response.status));
      return response;
    },
    (error: unknown) => {
      if (axios.isAxiosError(error) && error.response) {
        logHttpResponse(describe(error.config ?? {}, error.response.status));
      } else {
        logError(error);
      }
      throw error;
    },
  );
  return instance;
}

function describe(
  config: { method?: string; baseURL?: string; url?: string },
  status: number,
): { method: string; url: string; status: number } {
  const url = `${config.baseURL ?? ''}${config.url ?? ''}`.split('?')[0] as string;
  return { method: (config.method ?? 'get').toUpperCase(), url, status };
}

export const http: AxiosInstance = attachLogging(
  axios.create({ baseURL: import.meta.env.VITE_API_URL ?? '/api', timeout: 10000 }),
);

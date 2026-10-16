import axios, { type AxiosInstance } from 'axios';
import { logError, logHttpResponse } from '../logger';

export function attachLogging(instance: AxiosInstance): AxiosInstance {
  instance.interceptors.response.use(
    (response) => {
      logHttpResponse({
        method: (response.config.method ?? '').toUpperCase(),
        url: `${response.config.baseURL ?? ''}${response.config.url ?? ''}`.split('?')[0] as string,
        status: response.status,
      });
      return response;
    },
    (error: unknown) => {
      if (axios.isAxiosError(error) && error.response) {
        const config = error.response.config;
        logHttpResponse({
          method: (config.method ?? '').toUpperCase(),
          url: `${config.baseURL ?? ''}${config.url ?? ''}`.split('?')[0] as string,
          status: error.response.status,
        });
      } else {
        logError(error);
      }
      throw error;
    },
  );
  return instance;
}

export const http: AxiosInstance = attachLogging(
  axios.create({ baseURL: import.meta.env.VITE_API_URL ?? '/api', timeout: 10000 }),
);

export interface HttpResponseLog { method: string; path: string; status: number; durationMs: number }
export interface Logger { httpResponse(entry: HttpResponseLog): void; error(err: unknown): void }

export const consoleLogger: Logger = {
  httpResponse(entry) {
    console.log(JSON.stringify({ level: 'info', event: 'http_response', ...entry }));
  },
  error(err) {
    const detail =
      err instanceof Error
        ? { name: err.name, message: err.message, stack: err.stack }
        : { name: 'NonError', message: String(err) };
    console.error(JSON.stringify({ level: 'error', event: 'error', ...detail }));
  },
};

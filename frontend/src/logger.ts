export function logHttpResponse(entry: { method: string; url: string; status: number }): void {
  console.info(JSON.stringify({ level: 'info', event: 'http_response', ...entry }));
}

export function logError(err: unknown): void {
  const detail =
    err instanceof Error
      ? { name: err.name, message: err.message, stack: err.stack }
      : { name: 'NonError', message: String(err) };
  console.error(JSON.stringify({ level: 'error', event: 'error', ...detail }));
}

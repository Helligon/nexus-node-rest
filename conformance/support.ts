export const BASE = 'http://127.0.0.1:3997';

let counter = 0;
export const unique = (prefix: string) => `${prefix} ${Date.now()}-${process.pid}-${++counter}`;

/** Generates a valid, unique ISBN-13 (978 + 9 digits + check digit). */
export function isbn13(): string {
  counter += 1;
  const body = `978${String(Date.now() % 1_000_000).padStart(6, '0')}${String(counter % 1000).padStart(3, '0')}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
  return `${body}${(10 - (sum % 10)) % 10}`;
}

/** Generates a valid, unique ISBN-10. */
export function isbn10(): string {
  counter += 1;
  const body = `${String(Date.now() % 1_000_000).padStart(6, '0')}${String(counter % 1000).padStart(3, '0')}`;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * Number(body[i]);
  const check = (11 - (sum % 11)) % 11;
  return `${body}${check === 10 ? 'X' : check}`;
}

function tryParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export async function call(method: string, path: string, init: { headers?: Record<string, string>; body?: string } = {}) {
  const res = await fetch(`${BASE}${path}`, { method, ...init });
  const text = await res.text();
  return { status: res.status, headers: res.headers, text, json: tryParse(text) };
}

export const postJson = (body: unknown, headers: Record<string, string> = {}) =>
  call('POST', '/assets', {
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

import { expect } from 'vitest';
import { assertMatchesContract, assertMatchesSchema } from '../contract.js';

export { assertMatchesContract, assertMatchesSchema };

export const BASE_URL = (process.env.BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- bodies are checked against the contract at runtime
export type Json = any;

export interface ApiResponse {
  status: number;
  headers: Headers;
  body: Json;
}

export interface RequestOptions {
  json?: unknown;
  rawBody?: string;
  contentType?: string;
}

export async function api(method: string, path: string, options: RequestOptions = {}): Promise<ApiResponse> {
  const headers: Record<string, string> = {};
  let body: string | undefined;
  if (options.json !== undefined) {
    body = JSON.stringify(options.json);
    headers['content-type'] = 'application/json';
  }
  if (options.rawBody !== undefined) body = options.rawBody;
  if (options.contentType !== undefined) headers['content-type'] = options.contentType;
  const res = await fetch(`${BASE_URL}${path}`, { method, headers, body });
  const text = await res.text();
  let parsed: Json = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return { status: res.status, headers: res.headers, body: parsed };
}

export function query(params: Record<string, string>): string {
  return `?${new URLSearchParams(params).toString()}`;
}

export function unique(label: string): string {
  return `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function isbn13CheckDigit(first12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

export function isbn10CheckDigit(first9: string): string {
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (i + 1) * Number(first9[i]);
  const check = sum % 11;
  return check === 10 ? 'X' : String(check);
}

function randomDigits(count: number): string {
  let digits = '';
  for (let i = 0; i < count; i++) digits += String(Math.floor(Math.random() * 10));
  return digits;
}

export function randomIsbn13(): string {
  const first12 = `978${randomDigits(9)}`;
  return first12 + isbn13CheckDigit(first12);
}

export function randomIsbn10EndingInX(): string {
  for (;;) {
    const first9 = randomDigits(9);
    if (isbn10CheckDigit(first9) === 'X') return `${first9}X`;
  }
}

export async function createAsset(fields: Record<string, unknown>): Promise<Json> {
  const res = await api('POST', '/assets', { json: fields });
  if (res.status !== 201) throw new Error(`setup: expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
}

export function expectError(res: ApiResponse, status: number, code: string): void {
  expect(res.status).toBe(status);
  expect(res.headers.get('content-type') ?? '').toMatch(/^application\/json/);
  assertMatchesSchema('Error', res.body);
  expect(res.body.error.code).toBe(code);
  expect(JSON.stringify(res.body)).not.toMatch(/\bat .+:\d+:\d+/);
}

export function expectDetailFor(res: ApiResponse, field: string): void {
  const fields = (res.body.error.details ?? []).map((detail: { field: string }) => detail.field);
  expect(fields).toContain(field);
}

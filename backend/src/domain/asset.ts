import { z } from 'zod';

export const ASSET_STATUSES = ['available', 'on_loan', 'lost'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];
export interface Asset { id: string; title: string; author: string; isbn: string | null; status: AssetStatus; createdAt: string }
export interface NewAsset { title: string; author: string; isbn: string | null; status: AssetStatus }
export interface AssetFilter { author?: string; status?: AssetStatus; q?: string }
export interface FieldIssue { field: string; issue: string }
export type ParseResult<T> = { ok: true; value: T } | { ok: false; issues: FieldIssue[] };

export function normaliseIsbn(raw: string): string {
  return raw.replace(/[ -]/g, '').replace(/x/g, 'X');
}

export function isValidIsbn(normalised: string): boolean {
  if (/^\d{9}[\dX]$/.test(normalised)) {
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      const ch = normalised[i] as string;
      sum += (10 - i) * (ch === 'X' ? 10 : Number(ch));
    }
    return sum % 11 === 0;
  }
  if (/^\d{13}$/.test(normalised)) {
    let sum = 0;
    for (let i = 0; i < 13; i++) sum += Number(normalised[i]) * (i % 2 === 0 ? 1 : 3);
    return sum % 10 === 0;
  }
  return false;
}

const statusSchema = z.enum(ASSET_STATUSES);
const STATUS_ISSUE = 'must be one of available, on_loan, lost';

const trimmedText = (max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .refine((s) => s.length >= 1 && s.length <= max);
const titleSchema = trimmedText(200);
const authorSchema = trimmedText(100);
const isbnSchema = z
  .string()
  .transform(normaliseIsbn)
  .refine(isValidIsbn);

const KNOWN_BODY_FIELDS = ['title', 'author', 'isbn', 'status'];

function textField(
  body: Record<string, unknown>,
  field: 'title' | 'author',
  schema: z.ZodType<string>,
  max: number,
  issues: FieldIssue[],
): string {
  const raw = body[field];
  if (typeof raw !== 'string') {
    issues.push({ field, issue: 'is required and must be a string' });
    return '';
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    issues.push({ field, issue: `must be 1-${max} characters` });
    return '';
  }
  return parsed.data;
}

export function parseNewAsset(body: unknown): ParseResult<NewAsset> {
  const input = body === undefined ? {} : body;
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, issues: [{ field: 'body', issue: 'must be a JSON object' }] };
  }
  const record = input as Record<string, unknown>;
  const issues: FieldIssue[] = [];

  const title = textField(record, 'title', titleSchema, 200, issues);
  const author = textField(record, 'author', authorSchema, 100, issues);

  let isbn: string | null = null;
  if (record.isbn !== undefined && record.isbn !== null) {
    const parsed = isbnSchema.safeParse(record.isbn);
    if (parsed.success) isbn = parsed.data;
    else issues.push({ field: 'isbn', issue: 'must be a valid ISBN-10 or ISBN-13' });
  }

  let status: AssetStatus = 'available';
  if (record.status !== undefined) {
    const parsed = statusSchema.safeParse(record.status);
    if (parsed.success) status = parsed.data;
    else issues.push({ field: 'status', issue: STATUS_ISSUE });
  }

  for (const key of Object.keys(record)) {
    if (!KNOWN_BODY_FIELDS.includes(key)) {
      issues.push({ field: key === '' ? 'body' : key, issue: 'is not allowed' });
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: { title, author, isbn, status } };
}

const FILTER_KEYS = ['author', 'status', 'q'];

export function parseAssetFilter(query: URLSearchParams): ParseResult<AssetFilter> {
  const keys = [...new Set(query.keys())];
  const issues: FieldIssue[] = [];
  const value: AssetFilter = {};

  for (const key of FILTER_KEYS) {
    if (!keys.includes(key)) continue;
    const all = query.getAll(key);
    if (all.length > 1) {
      issues.push({ field: key, issue: 'must be given once' });
      continue;
    }
    const trimmed = (all[0] as string).trim();
    if (key === 'status') {
      const parsed = statusSchema.safeParse(trimmed);
      if (parsed.success) value.status = parsed.data;
      else issues.push({ field: key, issue: STATUS_ISSUE });
    } else {
      const max = key === 'author' ? 100 : 200;
      if (trimmed.length < 1 || trimmed.length > max) {
        issues.push({ field: key, issue: `must be 1-${max} characters` });
      } else if (key === 'author') value.author = trimmed;
      else value.q = trimmed;
    }
  }

  for (const key of keys) {
    if (!FILTER_KEYS.includes(key)) {
      issues.push({ field: key === '' ? 'query' : key, issue: 'is not a supported filter' });
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value };
}

import { z } from 'zod';

export const ASSET_STATUSES = ['available', 'on_loan', 'lost'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];
export interface Asset { id: string; title: string; author: string; isbn: string | null; status: AssetStatus; createdAt: string }
export interface NewAsset { title: string; author: string; isbn: string | null; status: AssetStatus }
export interface AssetFilter { author?: string; status?: AssetStatus; q?: string }
export interface FieldIssue { field: string; issue: string }
export type ParseResult<T> = { ok: true; value: T } | { ok: false; issues: FieldIssue[] };

const STATUS_ISSUE = 'must be one of available, on_loan, lost';
const ISBN_ISSUE = 'must be a valid ISBN-10 or ISBN-13';

export function normaliseIsbn(raw: string): string {
  return raw.replace(/[ -]/g, '').replace(/x/g, 'X');
}

export function isValidIsbn(normalised: string): boolean {
  if (/^\d{9}[\dX]$/.test(normalised)) {
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      const ch = normalised[i] as string;
      sum += (ch === 'X' ? 10 : Number(ch)) * (10 - i);
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

// Lengths are UTF-16 code units (`.length`), as §4.1 requires; Zod's min/max count differently.
const lengthWithin = (max: number) => (v: string) => v.length >= 1 && v.length <= max;

const trimmedText = (max: number) =>
  z.string({ error: 'type' }).trim().refine(lengthWithin(max), { error: 'length' });

const titleSchema = trimmedText(200);
const authorSchema = trimmedText(100);
const isbnSchema = z
  .string()
  .transform(normaliseIsbn)
  .refine(isValidIsbn);
const statusSchema = z.enum(ASSET_STATUSES);

const ASSET_FIELDS = ['title', 'author', 'isbn', 'status'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function textIssue(field: 'title' | 'author', max: number, parsed: { success: boolean; error?: z.ZodError }): FieldIssue {
  const isType = parsed.error?.issues[0]?.message === 'type';
  return { field, issue: isType ? 'is required and must be a string' : `must be 1-${max} characters` };
}

export function parseNewAsset(body: unknown): ParseResult<NewAsset> {
  const input = body === undefined ? {} : body;
  if (!isRecord(input)) return { ok: false, issues: [{ field: 'body', issue: 'must be a JSON object' }] };

  const issues: FieldIssue[] = [];

  const title = titleSchema.safeParse(input.title);
  if (!title.success) issues.push(textIssue('title', 200, title));
  const author = authorSchema.safeParse(input.author);
  if (!author.success) issues.push(textIssue('author', 100, author));

  const rawIsbn = input.isbn ?? null;
  const isbn = rawIsbn === null ? null : isbnSchema.safeParse(rawIsbn);
  if (isbn?.success === false) issues.push({ field: 'isbn', issue: ISBN_ISSUE });

  const status = 'status' in input ? statusSchema.safeParse(input.status) : undefined;
  if (status !== undefined && !status.success) issues.push({ field: 'status', issue: STATUS_ISSUE });

  for (const key of Object.keys(input)) {
    if (!(ASSET_FIELDS as readonly string[]).includes(key)) {
      issues.push({ field: key === '' ? 'body' : key, issue: 'is not allowed' });
    }
  }

  if (issues.length > 0 || !title.success || !author.success) return { ok: false, issues };
  return {
    ok: true,
    value: {
      title: title.data,
      author: author.data,
      isbn: isbn?.data ?? null,
      status: status?.success ? status.data : 'available',
    },
  };
}

const textFilter = (max: number) => z.string().trim().refine(lengthWithin(max));

const FILTER_SCHEMAS = {
  author: textFilter(100),
  status: z.string().trim().pipe(statusSchema),
  q: textFilter(200),
} as const;
const FILTER_ISSUES = {
  author: 'must be 1-100 characters',
  status: STATUS_ISSUE,
  q: 'must be 1-200 characters',
} as const;
const FILTER_KEYS = ['author', 'status', 'q'] as const;

export function parseAssetFilter(query: URLSearchParams): ParseResult<AssetFilter> {
  const issues: FieldIssue[] = [];
  const value: Record<string, string> = {};

  for (const key of FILTER_KEYS) {
    const values = query.getAll(key);
    if (values.length === 0) continue;
    if (values.length > 1) {
      issues.push({ field: key, issue: 'must be given once' });
      continue;
    }
    const parsed = FILTER_SCHEMAS[key].safeParse(values[0]);
    if (parsed.success) value[key] = parsed.data;
    else issues.push({ field: key, issue: FILTER_ISSUES[key] });
  }

  for (const key of new Set(query.keys())) {
    if (!(FILTER_KEYS as readonly string[]).includes(key)) {
      issues.push({ field: key === '' ? 'query' : key, issue: 'is not a supported filter' });
    }
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: value as AssetFilter };
}

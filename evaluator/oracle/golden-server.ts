// Independent, dependency-free implementation of the contract and the instructions' decisions log.
// It proves the acceptance suite and produces the behaviour baseline. Never shipped to a build.
// Instructed behaviours it deliberately does not model (extend it before adding probe steps for them):
// - a JSON body with charset=latin1 → 415;
// - CORS preflight OPTIONS → 204.
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';

type Status = 'available' | 'on_loan' | 'lost';

interface Asset {
  id: string;
  title: string;
  author: string;
  isbn: string | null;
  status: Status;
  createdAt: string;
}

interface Issue {
  field: string;
  issue: string;
}

interface Filter {
  author?: string;
  status?: string;
  q?: string;
}

const STATUSES: readonly string[] = ['available', 'on_loan', 'lost'];
const ASSET_FIELDS: readonly string[] = ['title', 'author', 'isbn', 'status'];
const FILTER_FIELDS: readonly string[] = ['author', 'status', 'q'];
const BODY_LIMIT = 10 * 1024;

export function normaliseIsbn(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

export function isValidIsbn(isbn: string): boolean {
  if (/^\d{9}[\dX]$/.test(isbn)) {
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      const char = isbn.charAt(i);
      sum += (char === 'X' ? 10 : Number(char)) * (10 - i);
    }
    return sum % 11 === 0;
  }
  if (/^\d{13}$/.test(isbn)) {
    let sum = 0;
    for (let i = 0; i < 13; i++) sum += Number(isbn.charAt(i)) * (i % 2 === 0 ? 1 : 3);
    return sum % 10 === 0;
  }
  return false;
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', ...headers });
  res.end(JSON.stringify(body));
}

function fail(res: ServerResponse, status: number, code: string, message: string, details?: Issue[], headers: Record<string, string> = {}): void {
  send(res, status, { error: details ? { code, message, details } : { code, message } }, headers);
}

function readBody(req: IncomingMessage): Promise<{ tooLarge: boolean; text: string }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > BODY_LIMIT) tooLarge = true;
      else chunks.push(chunk);
    });
    req.on('end', () => resolve({ tooLarge, text: Buffer.concat(chunks).toString('utf8') }));
    req.on('error', reject);
  });
}

function validateNewAsset(body: unknown): { value?: Omit<Asset, 'id' | 'createdAt'>; issues: Issue[] } {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { issues: [{ field: 'body', issue: 'must be a JSON object' }] };
  }
  const input = body as Record<string, unknown>;
  const issues: Issue[] = [];
  for (const key of Object.keys(input)) {
    if (!ASSET_FIELDS.includes(key)) issues.push({ field: key, issue: 'is not allowed' });
  }
  const text = (field: 'title' | 'author', max: number): string => {
    const value = input[field];
    if (typeof value !== 'string') {
      issues.push({ field, issue: 'is required and must be a string' });
      return '';
    }
    const trimmed = value.trim();
    if (trimmed.length < 1 || trimmed.length > max) issues.push({ field, issue: `must be 1-${max} characters` });
    return trimmed;
  };
  const title = text('title', 200);
  const author = text('author', 100);
  let isbn: string | null = null;
  if (input.isbn !== undefined && input.isbn !== null) {
    if (typeof input.isbn !== 'string' || !isValidIsbn(normaliseIsbn(input.isbn))) {
      issues.push({ field: 'isbn', issue: 'must be a valid ISBN-10 or ISBN-13' });
    } else {
      isbn = normaliseIsbn(input.isbn);
    }
  }
  let status: Status = 'available';
  if (input.status !== undefined) {
    if (typeof input.status !== 'string' || !STATUSES.includes(input.status)) {
      issues.push({ field: 'status', issue: 'must be one of available, on_loan, lost' });
    } else {
      status = input.status as Status;
    }
  }
  return issues.length > 0 ? { issues } : { value: { title, author, isbn, status }, issues };
}

function parseFilter(params: URLSearchParams): { filter?: Filter; issues: Issue[] } {
  const issues: Issue[] = [];
  const filter: Filter = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    if (!FILTER_FIELDS.includes(key)) {
      issues.push({ field: key, issue: 'is not a supported filter' });
      continue;
    }
    if (values.length > 1) {
      issues.push({ field: key, issue: 'must be given once' });
      continue;
    }
    const value = (values[0] ?? '').trim();
    if (key === 'status') {
      if (STATUSES.includes(value)) filter.status = value;
      else issues.push({ field: key, issue: 'must be one of available, on_loan, lost' });
      continue;
    }
    const max = key === 'author' ? 100 : 200;
    if (value.length < 1 || value.length > max) issues.push({ field: key, issue: `must be 1-${max} characters` });
    else filter[key as 'author' | 'q'] = value;
  }
  return issues.length > 0 ? { issues } : { filter, issues };
}

async function create(req: IncomingMessage, res: ServerResponse, assets: Asset[]): Promise<void> {
  const mediaType = (req.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') {
    fail(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json');
    return;
  }
  const { tooLarge, text } = await readBody(req);
  if (tooLarge) {
    fail(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body must be 10 kb or smaller');
    return;
  }
  let body: unknown;
  try {
    body = text.length === 0 ? {} : JSON.parse(text);
  } catch {
    fail(res, 400, 'VALIDATION_ERROR', 'Request body is not valid JSON', [{ field: 'body', issue: 'must be valid JSON' }]);
    return;
  }
  const { value, issues } = validateNewAsset(body);
  if (!value) {
    fail(res, 400, 'VALIDATION_ERROR', 'Request body is invalid', issues);
    return;
  }
  if (value.isbn !== null && assets.some((asset) => asset.isbn === value.isbn)) {
    fail(res, 409, 'CONFLICT', 'An asset with this ISBN already exists');
    return;
  }
  const asset: Asset = { id: randomUUID(), ...value, createdAt: new Date().toISOString() };
  assets.push(asset);
  send(res, 201, asset, { location: `/assets/${asset.id}` });
}

function list(res: ServerResponse, url: URL, assets: Asset[]): void {
  const { filter, issues } = parseFilter(url.searchParams);
  if (!filter) {
    fail(res, 400, 'VALIDATION_ERROR', 'Query is invalid', issues);
    return;
  }
  const author = filter.author?.toLowerCase();
  const q = filter.q?.toLowerCase();
  const data = assets.filter(
    (asset) =>
      (author === undefined || asset.author.toLowerCase() === author) &&
      (filter.status === undefined || asset.status === filter.status) &&
      (q === undefined || asset.title.toLowerCase().includes(q)),
  );
  send(res, 200, { data });
}

function methodNotAllowed(res: ServerResponse, allow: string): void {
  fail(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed', undefined, { allow });
}

async function route(req: IncomingMessage, res: ServerResponse, url: URL, assets: Asset[]): Promise<void> {
  const method = req.method ?? 'GET';
  const isGet = method === 'GET' || method === 'HEAD';
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path === '/ping') {
    if (isGet) send(res, 200, { status: 'ok' });
    else methodNotAllowed(res, 'GET');
    return;
  }
  if (path === '/assets') {
    if (isGet) list(res, url, assets);
    else if (method === 'POST') await create(req, res, assets);
    else methodNotAllowed(res, 'GET, POST');
    return;
  }
  const match = /^\/assets\/([^/]+)$/.exec(path);
  if (match) {
    if (!isGet) {
      methodNotAllowed(res, 'GET');
      return;
    }
    const asset = assets.find((candidate) => candidate.id === decodeURIComponent(match[1] ?? ''));
    if (asset) send(res, 200, asset);
    else fail(res, 404, 'NOT_FOUND', 'Asset not found');
    return;
  }
  fail(res, 404, 'NOT_FOUND', 'Route not found');
}

export function createGoldenServer(log: (line: string) => void = (line) => process.stdout.write(`${line}\n`)): Server {
  const assets: Asset[] = [];
  return createServer((req, res) => {
    const started = performance.now();
    const url = new URL(req.url ?? '/', 'http://localhost');
    res.on('finish', () => {
      log(JSON.stringify({ level: 'info', event: 'http_response', method: req.method, path: url.pathname, status: res.statusCode, durationMs: performance.now() - started }));
    });
    route(req, res, url, assets).catch((err: unknown) => {
      const error = err instanceof Error ? err : new Error(String(err));
      log(JSON.stringify({ level: 'error', event: 'error', name: error.name, message: error.message, stack: error.stack }));
      fail(res, 500, 'INTERNAL_ERROR', 'Internal server error');
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  createGoldenServer().listen(Number(process.env.PORT ?? 3999));
}

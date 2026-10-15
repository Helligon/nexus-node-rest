// A fixed request sequence run against every build. Normalised output is compared with the golden
// baseline: matching golden means accurate, and all runs matching golden means consistent.
export interface ProbeStep {
  name: string;
  method: string;
  path: string;
  json?: unknown;
  rawBody?: string;
  contentType?: string;
}

export interface ProbeRecord {
  name: string;
  method: string;
  path: string;
  status: number;
  contentType: string | null;
  location: string | null;
  allow: string | null;
  body: unknown;
}

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

export const PROBE_STEPS: ProbeStep[] = [
  { name: 'ping', method: 'GET', path: '/ping' },
  { name: 'create-a', method: 'POST', path: '/assets', json: { title: 'Probe Book A', author: 'Probe Author', isbn: '978-0-306-40615-7' } },
  { name: 'create-b', method: 'POST', path: '/assets', json: { title: '  Probe Book B  ', author: 'probe author', isbn: '0-306-40615-2', status: 'on_loan' } },
  { name: 'create-c', method: 'POST', path: '/assets', json: { title: 'Another Title', author: 'Someone Else', status: 'lost' } },
  { name: 'duplicate-isbn', method: 'POST', path: '/assets', json: { title: 'Dup', author: 'X', isbn: '9780306406157' } },
  { name: 'missing-fields', method: 'POST', path: '/assets', json: {} },
  { name: 'bad-isbn', method: 'POST', path: '/assets', json: { title: 'T', author: 'A', isbn: '9780306406158' } },
  { name: 'bad-status', method: 'POST', path: '/assets', json: { title: 'T', author: 'A', status: 'borrowed' } },
  { name: 'unknown-field', method: 'POST', path: '/assets', json: { title: 'T', author: 'A', colour: 'red' } },
  { name: 'malformed-json', method: 'POST', path: '/assets', rawBody: '{"title":', contentType: 'application/json' },
  { name: 'wrong-content-type', method: 'POST', path: '/assets', rawBody: 'title=T', contentType: 'text/plain' },
  { name: 'too-large', method: 'POST', path: '/assets', json: { title: 'x'.repeat(11000), author: 'A' } },
  { name: 'list-all', method: 'GET', path: '/assets' },
  { name: 'list-author', method: 'GET', path: '/assets?author=PROBE%20AUTHOR' },
  { name: 'list-status', method: 'GET', path: '/assets?status=on_loan' },
  { name: 'list-q', method: 'GET', path: '/assets?q=book' },
  { name: 'list-combined', method: 'GET', path: '/assets?author=probe%20author&status=available' },
  { name: 'list-none', method: 'GET', path: '/assets?q=zzzz' },
  { name: 'list-bad-status', method: 'GET', path: '/assets?status=borrowed' },
  { name: 'list-unknown-param', method: 'GET', path: '/assets?colour=red' },
  { name: 'list-repeated', method: 'GET', path: '/assets?author=a&author=b' },
  { name: 'get-a', method: 'GET', path: '/assets/{create-a}' },
  { name: 'get-missing', method: 'GET', path: `/assets/${MISSING_ID}` },
  { name: 'get-malformed', method: 'GET', path: '/assets/not-a-uuid' },
  { name: 'delete-assets', method: 'DELETE', path: '/assets' },
  { name: 'put-asset', method: 'PUT', path: '/assets/{create-a}' },
  { name: 'post-ping', method: 'POST', path: '/ping' },
  { name: 'unknown-route', method: 'GET', path: '/no-such-route' },
];

export async function runProbe(baseUrl: string, steps: ProbeStep[] = PROBE_STEPS, timeoutMs = 10_000): Promise<ProbeRecord[]> {
  const ids = new Map<string, string>();
  const records: ProbeRecord[] = [];
  for (const step of steps) {
    const path = step.path.replace(/\{([a-z-]+)\}/g, (_match, name: string) => ids.get(name) ?? `missing-${name}`);
    const headers: Record<string, string> = {};
    let body: string | undefined;
    if (step.json !== undefined) {
      body = JSON.stringify(step.json);
      headers['content-type'] = 'application/json';
    }
    if (step.rawBody !== undefined) body = step.rawBody;
    if (step.contentType !== undefined) headers['content-type'] = step.contentType;
    let status: number;
    let responseHeaders: Headers | null = null;
    let parsed: unknown;
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, { method: step.method, headers, body, signal: AbortSignal.timeout(timeoutMs) });
      const text = await res.text();
      status = res.status;
      responseHeaders = res.headers;
      parsed = text.length === 0 ? null : text;
      try {
        if (text.length > 0) parsed = JSON.parse(text);
      } catch {
        // keep the raw text; it will show up as a difference
      }
    } catch (err) {
      status = 0;
      parsed = { error: `request failed: ${err instanceof Error ? err.message : String(err)}` };
    }
    const id = (parsed as { id?: unknown } | null)?.id;
    if (status === 201 && typeof id === 'string') ids.set(step.name, id);
    records.push({
      name: step.name,
      method: step.method,
      path: step.path,
      status,
      contentType: responseHeaders?.get('content-type') ?? null,
      location: responseHeaders?.get('location') ?? null,
      allow: responseHeaders?.get('allow') ?? null,
      body: parsed,
    });
  }
  return records;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function normaliseRecords(records: ProbeRecord[]): ProbeRecord[] {
  const tokens = new Map<string, string>();
  const token = (id: string): string => {
    const key = id.toLowerCase();
    if (!tokens.has(key)) tokens.set(key, `<id:${tokens.size + 1}>`);
    return tokens.get(key) as string;
  };
  const walk = (value: unknown, key?: string): unknown => {
    if (Array.isArray(value)) {
      if (key === 'details') return [...new Set(value.map((detail) => String((detail as { field?: unknown }).field)))].sort();
      return value.map((item) => walk(item));
    }
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, walk(child, childKey)]));
    }
    if (typeof value === 'string') {
      if (key === 'createdAt') return '<timestamp>';
      if (key === 'message' || key === 'issue') return '<text>';
      return value.replace(UUID, (match) => token(match));
    }
    return value;
  };
  return records.map((record) => {
    const contentType = record.contentType?.split(';')[0]?.trim().toLowerCase() ?? null;
    const location = record.location?.replace(UUID, (match) => token(match)) ?? null;
    return { ...record, contentType, location, body: walk(record.body) };
  });
}

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';
import { describe, expect, it } from 'vitest';

const CONTRACT = fileURLToPath(new URL('../contract/openapi.yaml', import.meta.url));

describe('contract/openapi.yaml', () => {
  it('is a valid OpenAPI 3.1 document', async () => {
    await expect(SwaggerParser.validate(CONTRACT)).resolves.toBeTruthy();
  });

  it('defines exactly the required operations', async () => {
    const api = (await SwaggerParser.parse(CONTRACT)) as { paths: Record<string, Record<string, unknown>> };
    const operations = Object.entries(api.paths).flatMap(([path, item]) => Object.keys(item).map((method) => `${method.toUpperCase()} ${path}`));
    expect(operations.sort()).toEqual(['GET /assets', 'GET /assets/{id}', 'GET /ping', 'POST /assets']);
  });

  it('ends with a newline and contains no four-backtick fence', () => {
    const text = readFileSync(CONTRACT, 'utf8');
    expect(text.endsWith('\n')).toBe(true);
    expect(text.includes('````')).toBe(false);
  });
});

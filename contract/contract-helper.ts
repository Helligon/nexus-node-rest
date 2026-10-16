import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';

interface OpenApiDoc {
  paths: Record<string, Record<string, { responses: Record<string, { $ref?: string; content?: Record<string, { schema: unknown }> }> }>>;
  components: { schemas: Record<string, unknown>; responses: Record<string, { content: Record<string, { schema: unknown }> }> };
}

const specPath = fileURLToPath(new URL('./openapi.yaml', import.meta.url));
const doc = parse(readFileSync(specPath, 'utf8')) as OpenApiDoc;

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(doc, 'openapi.json');

const escapeSegment = (s: string): string => encodeURIComponent(s.replace(/~/g, '~0').replace(/\//g, '~1'));
const pointer = (...segments: string[]): string => `openapi.json#/${segments.map(escapeSegment).join('/')}`;

function validate(ref: string, body: unknown): void {
  const check = ajv.compile({ $ref: ref });
  if (!check(body)) {
    throw new Error(`Body does not match the contract: ${ajv.errorsText(check.errors)}`);
  }
}

export function assertMatchesContract(method: string, pathTemplate: string, status: number, body: unknown): void {
  const lower = method.toLowerCase();
  const operation = doc.paths[pathTemplate]?.[lower];
  if (!operation) throw new Error(`Contract has no operation ${method.toUpperCase()} ${pathTemplate}`);
  const response = operation.responses[String(status)];
  if (!response) throw new Error(`Contract has no ${status} response for ${method.toUpperCase()} ${pathTemplate}`);
  if (response.$ref) {
    const name = response.$ref.split('/').pop() as string;
    validate(pointer('components', 'responses', name, 'content', 'application/json', 'schema'), body);
  } else {
    validate(
      pointer('paths', pathTemplate, lower, 'responses', String(status), 'content', 'application/json', 'schema'),
      body,
    );
  }
}

export function assertMatchesSchema(schemaName: string, body: unknown): void {
  if (!(schemaName in doc.components.schemas)) throw new Error(`Contract has no schema ${schemaName}`);
  validate(pointer('components', 'schemas', schemaName), body);
}

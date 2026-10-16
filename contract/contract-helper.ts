import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

interface Doc {
  paths: Record<string, Record<string, { responses: Record<string, { $ref?: string; content?: Record<string, { schema: unknown }> }> }>>;
  components: { schemas: Record<string, unknown>; responses: Record<string, { content: Record<string, { schema: unknown }> }> };
}

const doc = parse(readFileSync(join(import.meta.dirname, 'openapi.yaml'), 'utf8')) as Doc;
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats.default(ajv);
ajv.addSchema(doc, 'openapi.json');

const pointer = (...segments: string[]) =>
  segments.map((s) => encodeURIComponent(s.replace(/~/g, '~0').replace(/\//g, '~1'))).join('/');

function validate(pointerPath: string, body: unknown): void {
  const check = ajv.compile({ $ref: `openapi.json#/${pointerPath}` });
  if (!check(body)) {
    throw new Error(`Response does not match the contract: ${ajv.errorsText(check.errors)}`);
  }
}

export function assertMatchesContract(method: string, pathTemplate: string, status: number, body: unknown): void {
  const operation = doc.paths[pathTemplate]?.[method.toLowerCase()];
  if (!operation) throw new Error(`Contract has no operation ${method} ${pathTemplate}`);
  const response = operation.responses[String(status)];
  if (!response) throw new Error(`Contract has no ${status} response for ${method} ${pathTemplate}`);
  const base = ['paths', pathTemplate, method.toLowerCase(), 'responses', String(status)];
  if (response.$ref) {
    const name = response.$ref.split('/').pop() as string;
    validate(`${pointer('components', 'responses', name)}/content/application~1json/schema`, body);
  } else {
    validate(`${pointer(...base)}/content/application~1json/schema`, body);
  }
}

export function assertMatchesSchema(schemaName: string, body: unknown): void {
  if (!(schemaName in doc.components.schemas)) throw new Error(`Contract has no schema ${schemaName}`);
  validate(pointer('components', 'schemas', schemaName), body);
}

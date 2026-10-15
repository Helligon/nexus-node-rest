// The evaluator's own contract validator. Independent of anything a build contains.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { ValidateFunction } from 'ajv';
import { parse } from 'yaml';

const SPEC_ID = 'openapi.json';
export const CONTRACT_PATH = fileURLToPath(new URL('../../shelfwright/contract/openapi.yaml', import.meta.url));
const spec: unknown = parse(readFileSync(CONTRACT_PATH, 'utf8'));

const ajv = new Ajv2020({ allErrors: true, strict: false, validateSchema: false });
addFormats(ajv);
ajv.addSchema(spec as object, SPEC_ID);

const validators = new Map<string, ValidateFunction>();

function lookup(keys: string[]): unknown {
  let node: unknown = spec;
  for (const key of keys) {
    if (node === null || typeof node !== 'object' || !(key in node)) return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

function refToKeys(ref: string): string[] {
  if (!ref.startsWith('#/')) throw new Error(`Unsupported $ref ${ref}`);
  return ref.slice(2).split('/').map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function toFragment(keys: string[]): string {
  return `#/${keys.map((key) => encodeURIComponent(key.replace(/~/g, '~0').replace(/\//g, '~1'))).join('/')}`;
}

function check(keys: string[], body: unknown, label: string): void {
  const fragment = toFragment(keys);
  let validate = validators.get(fragment);
  if (!validate) {
    validate = ajv.compile({ $ref: `${SPEC_ID}${fragment}` });
    validators.set(fragment, validate);
  }
  if (!validate(body)) {
    throw new Error(`${label} does not match the contract: ${ajv.errorsText(validate.errors)}\nBody: ${JSON.stringify(body)}`);
  }
}

export function assertMatchesContract(method: string, pathTemplate: string, status: number, body: unknown): void {
  const label = `${method.toUpperCase()} ${pathTemplate}`;
  const operation = ['paths', pathTemplate, method.toLowerCase()];
  if (lookup(operation) === undefined) throw new Error(`Contract has no operation ${label}`);
  let response = [...operation, 'responses', String(status)];
  const node = lookup(response);
  if (node === undefined) throw new Error(`Contract has no ${status} response for ${label}`);
  const ref = (node as { $ref?: unknown }).$ref;
  if (typeof ref === 'string') response = refToKeys(ref);
  const schema = [...response, 'content', 'application/json', 'schema'];
  if (lookup(schema) === undefined) throw new Error(`Contract has no JSON body for ${status} on ${label}`);
  check(schema, body, `${label} -> ${status}`);
}

export function assertMatchesSchema(schemaName: string, body: unknown): void {
  const keys = ['components', 'schemas', schemaName];
  if (lookup(keys) === undefined) throw new Error(`Contract has no schema ${schemaName}`);
  check(keys, body, `Schema ${schemaName}`);
}

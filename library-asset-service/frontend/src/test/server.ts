import { HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { assertMatchesContract } from '../../../contract/contract-helper.js';

export const server = setupServer();

export function contractJson(method: string, pathTemplate: string, status: number, body: unknown) {
  assertMatchesContract(method, pathTemplate, status, body);
  return HttpResponse.json(body as Record<string, unknown>, { status });
}

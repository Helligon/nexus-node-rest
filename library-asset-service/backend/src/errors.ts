import type { FieldIssue } from './domain/asset.js';

export type ErrorCode = 'VALIDATION_ERROR' | 'NOT_FOUND' | 'METHOD_NOT_ALLOWED' | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE' | 'UNSUPPORTED_MEDIA_TYPE' | 'INTERNAL_ERROR';

export class HttpError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: FieldIssue[];

  constructor(status: number, code: ErrorCode, message: string, details?: FieldIssue[]) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = () => new HttpError(404, 'NOT_FOUND', 'Resource not found');
export const validationError = (details: FieldIssue[]) =>
  new HttpError(400, 'VALIDATION_ERROR', 'Request is invalid', details);

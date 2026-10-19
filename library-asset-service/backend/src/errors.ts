import type { FieldIssue } from './domain/asset.js';

export type ErrorCode = 'VALIDATION_ERROR' | 'NOT_FOUND' | 'METHOD_NOT_ALLOWED' | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE' | 'UNSUPPORTED_MEDIA_TYPE' | 'INTERNAL_ERROR';

const ERRORS: Record<ErrorCode, { status: number; message: string }> = {
  VALIDATION_ERROR: { status: 400, message: 'Request is invalid' },
  NOT_FOUND: { status: 404, message: 'Resource not found' },
  METHOD_NOT_ALLOWED: { status: 405, message: 'Method not allowed' },
  CONFLICT: { status: 409, message: 'An asset with this ISBN already exists' },
  PAYLOAD_TOO_LARGE: { status: 413, message: 'Request body must be 10 kb or smaller' },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, message: 'Content-Type must be application/json' },
  INTERNAL_ERROR: { status: 500, message: 'Internal server error' },
};

export class HttpError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: FieldIssue[];

  constructor(status: number, code: ErrorCode, message: string, details?: FieldIssue[]) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Builds the HttpError for `code`, with the status and message fixed by §4.7. */
export function httpError(code: ErrorCode, details?: FieldIssue[]): HttpError {
  const { status, message } = ERRORS[code];
  return new HttpError(status, code, message, details);
}

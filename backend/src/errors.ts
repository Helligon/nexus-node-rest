import type { FieldIssue } from './domain/asset.js';

export type ErrorCode = 'VALIDATION_ERROR' | 'NOT_FOUND' | 'METHOD_NOT_ALLOWED' | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE' | 'UNSUPPORTED_MEDIA_TYPE' | 'INTERNAL_ERROR';

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

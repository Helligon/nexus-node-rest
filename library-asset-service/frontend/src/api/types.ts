export const ASSET_STATUSES = ['available', 'on_loan', 'lost'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];
export const STATUS_LABELS: Record<AssetStatus, string> = { available: 'Available', on_loan: 'On loan', lost: 'Lost' };
export interface Asset { id: string; title: string; author: string; isbn: string | null; status: AssetStatus; createdAt: string }
export interface NewAsset { title: string; author: string; isbn?: string | null; status?: AssetStatus }
export interface AssetFilterValues { author?: string; status?: AssetStatus; q?: string }
export interface FieldIssue { field: string; issue: string }

export class ApiError extends Error {
  readonly status: number | null;
  readonly code: string;
  readonly details: FieldIssue[];

  constructor(status: number | null, code: string, message: string, details?: FieldIssue[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details ?? [];
  }
}

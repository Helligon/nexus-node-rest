import axios from 'axios';
import { http } from './client';
import { ApiError, type Asset, type AssetFilterValues, type FieldIssue, type NewAsset } from './types';

interface ErrorBody { error?: { code?: string; message?: string; details?: FieldIssue[] } }

function toApiError(err: unknown): unknown {
  if (!axios.isAxiosError<ErrorBody>(err)) return err;
  if (!err.response) return new ApiError(null, 'NETWORK_ERROR', err.message);
  const body = err.response.data?.error;
  return new ApiError(
    err.response.status,
    body?.code ?? 'UNKNOWN_ERROR',
    body?.message ?? err.message,
    body?.details,
  );
}

export async function listAssets(filters: AssetFilterValues): Promise<Asset[]> {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(filters)) {
    const trimmed = value?.trim();
    if (trimmed) params[key] = trimmed;
  }
  try {
    const res = await http.get<{ data: Asset[] }>('/assets', { params });
    return res.data.data;
  } catch (err) {
    throw toApiError(err);
  }
}

export async function createAsset(input: NewAsset): Promise<Asset> {
  const { isbn, ...rest } = input;
  const body: NewAsset = isbn ? { ...rest, isbn } : rest;
  try {
    const res = await http.post<Asset>('/assets', body);
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}

import axios from 'axios';
import { http } from './client';
import { ApiError } from './types';
import type { Asset, AssetFilterValues, NewAsset } from './types';

function toApiError(error: unknown): unknown {
  if (!axios.isAxiosError(error)) return error;
  if (!error.response) return new ApiError(null, 'NETWORK_ERROR', error.message);
  const body = (error.response.data as { error?: { code?: string; message?: string; details?: ApiError['details'] } } | undefined)?.error;
  return new ApiError(
    error.response.status,
    body?.code ?? 'UNKNOWN_ERROR',
    body?.message ?? error.message,
    body?.details,
  );
}

async function request<T>(send: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await send()).data;
  } catch (error) {
    throw toApiError(error);
  }
}

export async function listAssets(filters: AssetFilterValues): Promise<Asset[]> {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(filters)) {
    const trimmed = value.trim();
    if (trimmed !== '') params[key] = trimmed;
  }
  const body = await request(() => http.get<{ data: Asset[] }>('/assets', { params }));
  return body.data;
}

export async function createAsset(input: NewAsset): Promise<Asset> {
  const { isbn, ...rest } = input;
  const body: NewAsset = isbn ? { ...rest, isbn } : rest;
  return request(() => http.post<Asset>('/assets', body));
}

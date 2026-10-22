import { api } from '@/api/client';
import { buildApiPath } from '@/lib/env';
import type { OrganizationDto } from '@/types/organization';

export type MasterDataCategory = {
  id: string;
  name: string;
  description?: string | null;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type MasterDataResponse = {
  products?: unknown[];
  deleted_product_ids?: string[];
  categories?: MasterDataCategory[];
  deleted_category_ids?: string[];
  settings?: Record<string, unknown>;
  organization?: OrganizationDto;
  updated_at?: string;
  server_time?: string;
  has_more?: boolean;
  full_resync_recommended?: boolean;
};

export type MasterDataFetchResult =
  | { kind: 'ok'; data: MasterDataResponse }
  | { kind: 'not_modified' }
  | { kind: 'error' };

export type FetchMasterDataParams = {
  since: string;
  limit?: number;
};

export async function fetchMasterDataWithResult(
  sinceOrParams: string | FetchMasterDataParams,
): Promise<MasterDataFetchResult> {
  const params: FetchMasterDataParams =
    typeof sinceOrParams === 'string' ? { since: sinceOrParams } : sinceOrParams;
  const url = buildApiPath('/staff/master-data');
  try {
    const res = await api.get<MasterDataResponse>(url, {
      params: {
        since: params.since,
        ...(params.limit != null ? { limit: params.limit } : {}),
      },
      validateStatus: (status) => status === 200 || status === 304,
    });
    if (res.status === 304) return { kind: 'not_modified' };
    return { kind: 'ok', data: res.data ?? {} };
  } catch {
    return { kind: 'error' };
  }
}

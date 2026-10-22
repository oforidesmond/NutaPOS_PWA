import { api } from '@/api/client';
import { buildApiPath } from '@/lib/env';

export type TemporaryItemPayload = {
  barcode?: string;
  name: string;
  price: number;
  sold_at: string;
  staff_id: string;
  branch_id: string | null;
  local_product_id: string;
  local_sale_id: string;
};

export type TemporaryItemResponse = {
  id?: string;
  received?: boolean;
};

/** HTTP 2xx and 409 are success. Other statuses throw. */
export async function postTemporaryItem(body: TemporaryItemPayload): Promise<TemporaryItemResponse> {
  const url = buildApiPath('/staff/temporary-items');
  const { data } = await api.post<TemporaryItemResponse>(url, body, {
    validateStatus: (s) => (s >= 200 && s < 300) || s === 409,
  });
  return data ?? {};
}

import { api } from '@/api/client';
import { buildApiPath } from '@/lib/env';

export type StaffReturnPayload = {
  id: string;
  original_sale_id: string;
  refund_amount: number;
  returned_items: { product_id: string; quantity: number; unit_price: number }[];
  sold_at: string;
  staff_id: string;
  branch_id: string | null;
  receipt_number?: string | null;
  /** Lowercase snake per backend: cash | card | mobile_money | transfer | mixed */
  refund_method?: string;
};

const RETURN_TIMEOUT_MS = 30_000;

export class ReturnTimeoutError extends Error {
  constructor() {
    super('RETURN_TIMEOUT');
    this.name = 'ReturnTimeoutError';
  }
}

/** HTTP 2xx and 409 are success. */
export async function postStaffReturn(body: StaffReturnPayload): Promise<{ syncedAt?: string }> {
  const url = buildApiPath('/staff/returns');
  const { data } = await api.post(url, body, {
    timeout: RETURN_TIMEOUT_MS,
    validateStatus: (s) => (s >= 200 && s < 300) || s === 409,
  });
  return (data ?? {}) as { syncedAt?: string };
}

export async function postStaffReturnWithTimeout(
  body: StaffReturnPayload,
  timeoutMs = RETURN_TIMEOUT_MS,
): Promise<{ syncedAt?: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new ReturnTimeoutError()), timeoutMs);
    postStaffReturn(body)
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err: unknown) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

import { isAxiosError } from 'axios';
import { api } from '@/api/client';
import { buildApiPath } from '@/lib/env';
import type { SaleDeviceInfo } from '@/lib/saleDeviceInfo';
import type { VarianceReason } from '@/types/stockVariance';

export type { SaleDeviceInfo } from '@/lib/saleDeviceInfo';

/** Payload aligned with Prisma Sale + SaleItem. */
export type StaffSalePayload = {
  id: string;
  receiptNumber: string;
  /** Snake_case duplicate for NestJS / Prisma JSON bodies. */
  receipt_number: string;
  organizationId: string;
  createdById: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  paymentMethod: string;
  currency: string;
  soldAt: string;
  syncedAt?: string;
  deviceInfo?: SaleDeviceInfo;
  items: StaffSaleItemPayload[];
};

export type StaffSaleItemPayload = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  /**
   * Required by server iff the line was sold past local system stock at sale time.
   * Omit entirely on sufficient-stock or excluded lines.
   */
  varianceReason?: VarianceReason;
  /**
   * Required iff `varianceReason === 'OTHER'` (non-empty after trim).
   * Optional otherwise; omit when empty after trim.
   */
  varianceNote?: string;
};

/**
 * Structured DLQ business failure. Classify from this shape (both `errorCode`
 * and `failureId`), never from HTTP status text or words inside `message`.
 * The backend may emit it with HTTP 400, 403, or 409.
 */
export type StaffSaleDlqFailureBody = {
  errorCode: string;
  failureId: string;
  statusCode?: number;
  message?: string;
  retryable?: boolean;
  entityType?: string;
  entityId?: string;
};

export type StaffSalePostOutcome =
  | { kind: 'success'; syncedAt?: string }
  | { kind: 'duplicate-success'; syncedAt?: string }
  | { kind: 'dlq-failure'; failure: StaffSaleDlqFailureBody; status: number };

function readDlqFailure(data: unknown): StaffSaleDlqFailureBody | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  const errorCode = typeof obj.errorCode === 'string' ? obj.errorCode.trim() : '';
  const failureId = typeof obj.failureId === 'string' ? obj.failureId.trim() : '';
  if (!errorCode || !failureId) return null;
  return {
    errorCode,
    failureId,
    statusCode: typeof obj.statusCode === 'number' ? obj.statusCode : undefined,
    message: typeof obj.message === 'string' ? obj.message : undefined,
    retryable: typeof obj.retryable === 'boolean' ? obj.retryable : undefined,
    entityType: typeof obj.entityType === 'string' ? obj.entityType : undefined,
    entityId: typeof obj.entityId === 'string' ? obj.entityId : undefined,
  };
}

function responseMessage(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const raw = (data as { message?: unknown }).message;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(raw)) {
    const parts = raw
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    return parts.length > 0 ? parts.join(' · ') : null;
  }
  return null;
}

function unrecognisedSaleError(summary: string, data: unknown): Error {
  const detail = responseMessage(data);
  return new Error(detail ? `${summary}: ${detail}` : summary);
}

function readSyncedAt(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const obj = data as Record<string, unknown>;
  const camel = typeof obj.syncedAt === 'string' ? obj.syncedAt : undefined;
  const snake = typeof obj.synced_at === 'string' ? obj.synced_at : undefined;
  return camel ?? snake;
}

/**
 * Posts a staff sale and returns a structured outcome.
 *
 * - 2xx -> success.
 * - Any response with non-empty `errorCode` and `failureId` -> dlq-failure.
 * - 409 with `syncedAt`/`synced_at` and no `errorCode` -> duplicate-success.
 * - Anything else throws so the worker stays on the retry path.
 */
export async function postStaffSale(body: StaffSalePayload): Promise<StaffSalePostOutcome> {
  const url = buildApiPath('/staff/sales');
  const { data, status } = await api.post(url, body, {
    validateStatus: (s) => (s >= 200 && s < 300) || s === 400 || s === 403 || s === 409,
  });

  const dlq = readDlqFailure(data);
  if (dlq) {
    return { kind: 'dlq-failure', failure: dlq, status };
  }

  if (status >= 200 && status < 300) {
    return { kind: 'success', syncedAt: readSyncedAt(data) };
  }

  if (status === 409) {
    const syncedAt = readSyncedAt(data);
    if (syncedAt) {
      return { kind: 'duplicate-success', syncedAt };
    }
    throw unrecognisedSaleError('postStaffSale: unrecognised 409 response (no syncedAt, no errorCode)', data);
  }

  throw unrecognisedSaleError(`postStaffSale: unrecognised ${status} response without DLQ fields`, data);
}

/**
 * Display-only extractor for Nest 400 validation strings.
 * Never used to classify sale outcomes.
 */
export function parseStaffSaleErrorMessages(error: unknown): string[] {
  if (!isAxiosError(error)) return [];
  if (error.response?.status !== 400) return [];
  const data = error.response.data as { message?: unknown } | undefined;
  const raw = data?.message;
  if (typeof raw === 'string') return [raw];
  if (Array.isArray(raw)) return raw.filter((m): m is string => typeof m === 'string');
  return [];
}

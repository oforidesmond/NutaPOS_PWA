import type { StaffSalePayload } from '@/api/salesApi';
import { syncQueueRepository } from '@/db/syncQueueRepository';
import { updateSaleAmounts } from '@/db/saleRepository';
import { discountSettings } from '@/lib/checkoutSettings';
import { computeTotalWithDiscount, validateDiscount } from '@/lib/discount';

export const DISCOUNT_SYNC_ERROR_CODES = ['DISCOUNT_EXCEEDS_LIMIT', 'DISCOUNT_NOT_ALLOWED'] as const;

export function isDiscountSyncError(errorCode: string | null | undefined): boolean {
  if (!errorCode) return false;
  return (DISCOUNT_SYNC_ERROR_CODES as readonly string[]).includes(errorCode);
}

function readSalePayload(payload: unknown): { idempotencyKey?: string; body?: StaffSalePayload } {
  if (typeof payload === 'string') {
    return JSON.parse(payload) as { idempotencyKey?: string; body?: StaffSalePayload };
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid sale payload.');
  }
  return payload as { idempotencyKey?: string; body?: StaffSalePayload };
}

export async function repairFailedSaleDiscount(saleId: string, newDiscountAmount: number): Promise<void> {
  const row = await syncQueueRepository.findSaleByEntityId(saleId);
  if (!row) {
    throw new Error('Sale not found in sync queue.');
  }

  const parsed = readSalePayload(row.payload);
  const body = parsed.body;
  if (!body) {
    throw new Error('Invalid sale payload.');
  }

  const safeDiscount = Number.isFinite(newDiscountAmount) && newDiscountAmount > 0 ? newDiscountAmount : 0;
  const { subtotal, taxAmount } = body;
  const settings = await discountSettings();

  const validation = validateDiscount({
    discountAmount: safeDiscount,
    subtotal,
    ...settings,
  });
  if (validation.ok === false) {
    throw new Error(validation.message);
  }

  const totalAmount = computeTotalWithDiscount(subtotal, taxAmount, safeDiscount);
  if (totalAmount < 0) {
    throw new Error('Discount exceeds sale total.');
  }

  const updatedBody: StaffSalePayload = {
    ...body,
    discountAmount: safeDiscount,
    totalAmount,
  };

  await updateSaleAmounts(saleId, {
    discountAmount: safeDiscount,
    totalAmount,
  });

  await syncQueueRepository.updateSalePayloadAndRetry(saleId, {
    idempotencyKey: parsed.idempotencyKey ?? body.id,
    body: updatedBody,
  });
}

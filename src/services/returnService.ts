import { postStaffReturnWithTimeout, type StaffReturnPayload } from '@/api/returnsApi';
import {
  getReturnedQuantitiesByProduct,
  getSaleWithItems,
  insertLocalReturnTx,
  type InsertReturnInput,
} from '@/db/saleRepository';
import { normalizeQty, qtyGreater } from '@/lib/quantity';

export type ReturnLineInput = {
  productId: string;
  quantity: number;
  unitPrice: number;
  isTemporaryProduct: boolean;
};

function refundMethodFromOriginalPayment(paymentMethod: string | null | undefined): string | undefined {
  if (!paymentMethod) return undefined;
  const key = paymentMethod.toUpperCase().replace(/-/g, '_');
  const map: Record<string, string> = {
    CASH: 'cash',
    MOBILE_MONEY: 'mobile_money',
    CARD: 'card',
    TRANSFER: 'transfer',
    MIXED: 'mixed',
  };
  return map[key] ?? paymentMethod.toLowerCase();
}

export class InternetRequiredForReturnError extends Error {
  constructor() {
    super('INTERNET_REQUIRED');
    this.name = 'InternetRequiredForReturnError';
  }
}

function browserOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

/**
 * Returns are online-only. Nothing is written until `POST /staff/returns` succeeds.
 */
export const returnService = {
  async processReturn(input: {
    originalSaleId: string;
    lines: ReturnLineInput[];
    staffUserId: string;
    branchId: string | null;
  }): Promise<{ returnId: string }> {
    if (!browserOnline()) {
      throw new InternetRequiredForReturnError();
    }

    const bundle = await getSaleWithItems(input.originalSaleId);
    if (!bundle || bundle.sale.is_return === 1) {
      throw new Error('Original sale not found');
    }

    const originalByProduct = new Map<string, { quantity: number }[]>();
    for (const item of bundle.items) {
      const list = originalByProduct.get(item.product_id) ?? [];
      list.push(item);
      originalByProduct.set(item.product_id, list);
    }

    const alreadyReturned = await getReturnedQuantitiesByProduct(input.originalSaleId);
    const insertItems: InsertReturnInput['items'] = [];
    const returnedItemsPayload: StaffReturnPayload['returned_items'] = [];
    let refundTotal = 0;
    const soldAt = new Date().toISOString();
    const returnId = crypto.randomUUID();
    const receiptNumber = `RET-${returnId.slice(0, 8).toUpperCase()}`;

    for (const line of input.lines) {
      const quantity = normalizeQty(line.quantity);
      if (quantity <= 0) continue;
      const originals = originalByProduct.get(line.productId);
      if (!originals?.length) throw new Error(`Product ${line.productId} was not in the original sale`);
      const origQty = normalizeQty(originals.reduce((sum, row) => sum + row.quantity, 0));
      const retPrev = normalizeQty(alreadyReturned[line.productId] ?? 0);
      const available = normalizeQty(origQty - retPrev);
      if (qtyGreater(quantity, available)) {
        throw new Error(`Cannot return ${quantity} of item - only ${available} remaining`);
      }
      const lineTotal = Math.round(quantity * line.unitPrice * 100) / 100;
      refundTotal += lineTotal;
      insertItems.push({
        id: crypto.randomUUID(),
        productId: line.productId,
        quantity,
        unitPrice: line.unitPrice,
        totalPrice: lineTotal,
        isTemporaryProduct: line.isTemporaryProduct,
        stockDelta: quantity,
      });
      returnedItemsPayload.push({
        product_id: line.productId,
        quantity,
        unit_price: line.unitPrice,
      });
    }

    if (insertItems.length === 0) {
      throw new Error('Select at least one item to return');
    }

    refundTotal = Math.round(refundTotal * 100) / 100;

    const body: StaffReturnPayload = {
      id: returnId,
      original_sale_id: input.originalSaleId,
      refund_amount: refundTotal,
      returned_items: returnedItemsPayload,
      sold_at: soldAt,
      staff_id: input.staffUserId,
      branch_id: input.branchId,
      receipt_number: bundle.sale.receipt_number,
      refund_method: refundMethodFromOriginalPayment(bundle.sale.payment_method),
    };

    const apiRes = await postStaffReturnWithTimeout(body);
    const initialSyncedAt = apiRes.syncedAt ?? new Date().toISOString();

    await insertLocalReturnTx({
      returnId,
      receiptNumber,
      originalSaleId: input.originalSaleId,
      refundAmount: refundTotal,
      taxAmount: 0,
      paymentMethod: 'RETURN',
      soldAt,
      staffId: input.staffUserId,
      branchId: input.branchId,
      items: insertItems,
      initialSyncedAt,
    });

    return { returnId };
  },
};

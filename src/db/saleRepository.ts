import { db, type Sale, type SaleItem } from '@/db/schema';

export type InsertSaleInput = {
  saleId: string;
  receiptNumber: string;
  totalAmount: number;
  taxAmount: number;
  discountAmount: number;
  paymentMethod: string;
  soldAt: string;
  staffId: string;
  branchId: string | null;
  items: {
    id: string;
    productId: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    isTemporaryProduct: boolean;
    stockDelta: number;
    /** Stock-variance metadata frozen at sale time (mirrors sync payload). */
    varianceReason?: string | null;
    varianceNote?: string | null;
  }[];
  /** Ordered sync queue rows inserted atomically with the sale. */
  syncQueueEntries?: {
    entityType: string;
    entityId: string;
    operation: string;
    payload: Record<string, unknown>;
  }[];
  /** When true, increments trial_usage.sales_count in the same transaction. */
  incrementTrial?: boolean;
};

export async function insertLocalSaleTx(input: InsertSaleInput): Promise<void> {
  await db.transaction('rw', [db.sales, db.sale_items, db.products, db.sync_queue, db.trial_usage], async () => {
    await db.sales.add({
      id: input.saleId,
      total_amount: input.totalAmount,
      tax_amount: input.taxAmount,
      discount_amount: input.discountAmount,
      payment_method: input.paymentMethod,
      sold_at: input.soldAt,
      synced_at: null,
      staff_id: input.staffId,
      branch_id: input.branchId,
      is_return: 0,
      original_sale_id: null,
      receipt_number: input.receiptNumber,
    });

    for (const line of input.items) {
      await db.sale_items.add({
        id: line.id,
        sale_id: input.saleId,
        product_id: line.productId,
        quantity: line.quantity,
        unit_price: line.unitPrice,
        total_price: line.totalPrice,
        is_temporary_product: line.isTemporaryProduct ? 1 : 0,
        variance_reason: line.varianceReason ?? null,
        variance_note: line.varianceNote ?? null,
      });
      if (!line.isTemporaryProduct) {
        const product = await db.products.get(line.productId);
        if (product) {
          await db.products.update(line.productId, {
            stock_quantity: product.stock_quantity + line.stockDelta,
          });
        }
      }
    }

    if (input.syncQueueEntries?.length) {
      const createdAt = new Date().toISOString();
      for (const entry of input.syncQueueEntries) {
        await db.sync_queue.add({
          entity_type: entry.entityType,
          entity_id: entry.entityId,
          operation: entry.operation,
          payload: entry.payload,
          status: 'PENDING',
          attempt_count: 0,
          created_at: createdAt,
          last_attempt_at: null,
          last_error: null,
          failure_id: null,
          error_code: null,
          admin_message: null,
          last_failed_at: null,
          resolution_action: null,
          resolution_status: null,
          resolved_at: null,
          admin_applied_sale_id: null,
        });
      }
    }

    if (input.incrementTrial) {
      const row = await db.trial_usage.get(1);
      if (row) {
        await db.trial_usage.update(1, {
          sales_count: row.sales_count + 1,
          last_updated: new Date().toISOString(),
        });
      }
    }
  });
}

export type SaleSearchFilters = {
  receiptQuery?: string;
  dateFrom?: string;
  dateTo?: string;
  minAmount?: number;
  maxAmount?: number;
};

/**
 * Local non-return sales. Date bounds are ISO strings, compared the same way as
 * `sold_at >= ?` / `sold_at <= ?` in the mobile SQL (lexicographic on UTC ISO).
 * Receipt match is a case-insensitive substring of `receipt_number` or `id`.
 */
export async function searchSales(filters: SaleSearchFilters, limit = 100): Promise<Sale[]> {
  const query = filters.receiptQuery?.trim().toLowerCase();
  const rows = await db.sales.toArray();
  const matched = rows.filter((sale) => {
    if (sale.is_return !== 0) return false;
    if (query) {
      const receipt = (sale.receipt_number ?? '').toLowerCase();
      if (!receipt.includes(query) && !sale.id.toLowerCase().includes(query)) return false;
    }
    if (filters.dateFrom && sale.sold_at < filters.dateFrom) return false;
    if (filters.dateTo && sale.sold_at > filters.dateTo) return false;
    if (filters.minAmount != null && sale.total_amount < filters.minAmount) return false;
    if (filters.maxAmount != null && sale.total_amount > filters.maxAmount) return false;
    return true;
  });
  matched.sort((a, b) => (a.sold_at < b.sold_at ? 1 : a.sold_at > b.sold_at ? -1 : 0));
  return matched.slice(0, limit);
}

export async function getSaleWithItems(saleId: string): Promise<{ sale: Sale; items: SaleItem[] } | null> {
  const sale = await db.sales.get(saleId);
  if (!sale) return null;
  const items = await db.sale_items.where('sale_id').equals(saleId).toArray();
  return { sale, items };
}

export async function markSynced(saleId: string, syncedAt: string): Promise<void> {
  await db.sales.update(saleId, { synced_at: syncedAt });
}

export async function updateSaleAmounts(
  saleId: string,
  amounts: { discountAmount: number; totalAmount: number },
): Promise<void> {
  await db.sales.update(saleId, {
    discount_amount: amounts.discountAmount,
    total_amount: amounts.totalAmount,
  });
}

/** Quantities already returned per product for a given original sale. */
export async function getReturnedQuantitiesByProduct(originalSaleId: string): Promise<Record<string, number>> {
  const returns = await db.sales.filter((sale) => sale.is_return === 1 && sale.original_sale_id === originalSaleId).toArray();
  const out: Record<string, number> = {};
  for (const sale of returns) {
    const items = await db.sale_items.where('sale_id').equals(sale.id).toArray();
    for (const item of items) {
      out[item.product_id] = (out[item.product_id] ?? 0) + item.quantity;
    }
  }
  return out;
}

export type InsertReturnInput = {
  returnId: string;
  receiptNumber: string;
  originalSaleId: string;
  refundAmount: number;
  taxAmount: number;
  paymentMethod: string;
  soldAt: string;
  staffId: string;
  branchId: string | null;
  items: {
    id: string;
    productId: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    isTemporaryProduct: boolean;
    stockDelta: number;
  }[];
  initialSyncedAt?: string | null;
};

/**
 * Writes a return that the server already accepted.
 * Does not enqueue a sync row. Non-temporary lines increase local stock.
 */
export async function insertLocalReturnTx(input: InsertReturnInput): Promise<void> {
  await db.transaction('rw', [db.sales, db.sale_items, db.products], async () => {
    await db.sales.add({
      id: input.returnId,
      total_amount: input.refundAmount,
      tax_amount: input.taxAmount,
      discount_amount: 0,
      payment_method: input.paymentMethod,
      sold_at: input.soldAt,
      synced_at: input.initialSyncedAt ?? null,
      staff_id: input.staffId,
      branch_id: input.branchId,
      is_return: 1,
      original_sale_id: input.originalSaleId,
      receipt_number: input.receiptNumber,
    });

    for (const line of input.items) {
      await db.sale_items.add({
        id: line.id,
        sale_id: input.returnId,
        product_id: line.productId,
        quantity: line.quantity,
        unit_price: line.unitPrice,
        total_price: line.totalPrice,
        is_temporary_product: line.isTemporaryProduct ? 1 : 0,
        variance_reason: null,
        variance_note: null,
      });
      if (!line.isTemporaryProduct) {
        const product = await db.products.get(line.productId);
        if (product) {
          await db.products.update(line.productId, {
            stock_quantity: product.stock_quantity + line.stockDelta,
          });
        }
      }
    }
  });
}

export const saleRepository = {
  markSynced,
  updateSaleAmounts,
  getReturnedQuantitiesByProduct,
  insertLocalReturnTx,
  getSaleWithItems,
  searchSales,
};

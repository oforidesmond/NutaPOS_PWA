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

export async function getSaleWithItems(saleId: string): Promise<{ sale: Sale; items: SaleItem[] } | null> {
  const sale = await db.sales.get(saleId);
  if (!sale) return null;
  const items = await db.sale_items.where('sale_id').equals(saleId).toArray();
  return { sale, items };
}

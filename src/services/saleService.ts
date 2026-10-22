import type { StaffSaleItemPayload, StaffSalePayload } from '@/api/salesApi';
import { insertLocalSaleTx } from '@/db/saleRepository';
import { settingsRepository } from '@/db/settingsRepository';
import { discountSettings, taxSettings } from '@/lib/checkoutSettings';
import { previewTotals } from '@/lib/checkoutTotals';
import { validateDiscount } from '@/lib/discount';
import { generateReceiptNumber } from '@/lib/receiptNumber';
import { buildSaleDeviceInfo } from '@/lib/saleDeviceInfo';
import { normalizeQty } from '@/lib/quantity';
import { registerSaleSync } from '@/services/backgroundSync';
import { trialManager } from '@/services/trialManager';
import type { CartLine } from '@/stores/cartStore';
import type { OrganizationDto } from '@/types/organization';
import type { VarianceByLineKey, VarianceReason } from '@/types/stockVariance';

export type { DiscountSettings } from '@/lib/checkoutSettings';
export { discountSettings } from '@/lib/checkoutSettings';
export type { CheckoutTotalsPreview } from '@/lib/checkoutTotals';
export { previewTotals } from '@/lib/checkoutTotals';

export type CheckoutInput = {
  lines: CartLine[];
  paymentMethod: string;
  staffUserId: string;
  branchId: string | null;
  discountAmount?: number;
  /**
   * Per-line variance metadata captured by the StockVarianceModal. Only
   * keys that correspond to short lines should appear here; entries for
   * temporary or sufficient-stock lines are omitted from the wire payload.
   */
  stockVarianceByLineKey?: VarianceByLineKey;
};

const TEMPORARY_ITEM_VARIANCE_REASON: VarianceReason = 'PHYSICAL_STOCK_PRESENT';

function asPayload(value: object): Record<string, unknown> {
  return value as Record<string, unknown>;
}

export const saleService = {
  /**
   * Writes the sale, stock change, and sync queue in one IndexedDB transaction.
   * Does not upload and does not clear the cart. Local `synced_at` stays null.
   * The queued sale body still carries a client `syncedAt`, matching saleService.
   */
  async completeSale(input: CheckoutInput): Promise<{ saleId: string; receiptNumber: string }> {
    const trial = await trialManager.checkLimit();
    if (trial.trialActive && !trial.allowed) {
      throw new Error('TRIAL_LIMIT');
    }

    const org = await settingsRepository.getJson<OrganizationDto>(settingsRepository.keys.organization);
    const organizationId = org?.id;
    if (!organizationId) {
      throw new Error('Missing organization - run initial sync');
    }

    const { rate, enabled } = await taxSettings();
    const discountAmount =
      Number.isFinite(input.discountAmount) && (input.discountAmount ?? 0) > 0 ? (input.discountAmount ?? 0) : 0;
    const { subtotal, taxAmount, totalAmount } = await previewTotals(input.lines, discountAmount);

    const discountCheck = validateDiscount({
      discountAmount,
      subtotal,
      ...(await discountSettings()),
    });
    if (discountCheck.ok === false) {
      throw new Error(discountCheck.message);
    }
    if (totalAmount < 0) {
      throw new Error('Discount exceeds sale total');
    }

    const soldAt = new Date().toISOString();
    const saleId = crypto.randomUUID();
    const receiptNumber = generateReceiptNumber();
    const deviceInfo = await buildSaleDeviceInfo();

    const itemPayloads: StaffSalePayload['items'] = [];
    const insertItems: Parameters<typeof insertLocalSaleTx>[0]['items'] = [];
    const variance = input.stockVarianceByLineKey ?? {};

    for (const line of input.lines) {
      const product = line.product;
      const quantity = normalizeQty(line.quantity);
      const lineSub = Math.round(product.price * quantity * 100) / 100;
      const lineTax = enabled && rate > 0 ? Math.round(lineSub * (rate / 100) * 100) / 100 : 0;
      const lineTotal = Math.round((lineSub + lineTax) * 100) / 100;
      const itemId = crypto.randomUUID();
      const unitCost = product.cost_price ?? 0;

      // Temporary items have no tracked stock, but the backend still requires a
      // variance reason for zero-stock placeholder products created from the
      // unknown-barcode flow.
      const lineVariance =
        product.is_temporary === 1 ? { varianceReason: TEMPORARY_ITEM_VARIANCE_REASON } : variance[line.key];
      const trimmedNote = lineVariance?.varianceNote?.trim();
      const noteToPersist = trimmedNote && trimmedNote.length > 0 ? trimmedNote : null;

      insertItems.push({
        id: itemId,
        productId: product.id,
        quantity,
        unitPrice: product.price,
        totalPrice: lineSub,
        isTemporaryProduct: product.is_temporary === 1,
        stockDelta: -quantity,
        varianceReason: lineVariance?.varianceReason ?? null,
        varianceNote: noteToPersist,
      });

      const apiItem: StaffSaleItemPayload = {
        id: itemId,
        productId: product.id,
        productName: product.name,
        quantity,
        unitPrice: product.price,
        unitCost,
        taxRate: rate,
        taxAmount: lineTax,
        lineTotal,
      };
      if (lineVariance?.varianceReason) {
        apiItem.varianceReason = lineVariance.varianceReason;
        if (noteToPersist) apiItem.varianceNote = noteToPersist;
      }
      itemPayloads.push(apiItem);
    }

    const body: StaffSalePayload = {
      id: saleId,
      receiptNumber,
      receipt_number: receiptNumber,
      organizationId,
      createdById: input.staffUserId,
      subtotal,
      taxRate: rate,
      taxAmount,
      discountAmount,
      totalAmount,
      paymentMethod: input.paymentMethod,
      currency: org?.currency ?? 'GHS',
      soldAt,
      syncedAt: new Date().toISOString(),
      deviceInfo,
      items: itemPayloads,
    };

    const syncQueueEntries: Parameters<typeof insertLocalSaleTx>[0]['syncQueueEntries'] = [];

    for (const line of input.lines) {
      if (line.product.is_temporary !== 1) continue;
      const barcode = line.product.barcode?.trim();
      syncQueueEntries.push({
        entityType: 'temporary_item',
        entityId: `${saleId}_${line.product.id}`,
        operation: 'CREATE',
        payload: asPayload({
          body: {
            ...(barcode ? { barcode } : {}),
            name: line.product.name,
            price: line.product.price,
            sold_at: soldAt,
            staff_id: input.staffUserId,
            branch_id: input.branchId,
            local_product_id: line.product.id,
            local_sale_id: saleId,
          },
        }),
      });
    }

    syncQueueEntries.push({
      entityType: 'sale',
      entityId: saleId,
      operation: 'CREATE',
      payload: asPayload({ idempotencyKey: saleId, body }),
    });

    await insertLocalSaleTx({
      saleId,
      receiptNumber,
      totalAmount,
      taxAmount,
      discountAmount,
      paymentMethod: input.paymentMethod,
      soldAt,
      staffId: input.staffUserId,
      branchId: input.branchId,
      items: insertItems,
      syncQueueEntries,
      incrementTrial: trial.trialActive,
    });

    void registerSaleSync();

    return { saleId, receiptNumber };
  },
};

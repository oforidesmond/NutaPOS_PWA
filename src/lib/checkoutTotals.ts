import { taxSettings } from '@/lib/checkoutSettings';
import { computeTotalWithDiscount } from '@/lib/discount';
import { normalizeQty } from '@/lib/quantity';
import type { CartLine } from '@/stores/cartStore';

export type CheckoutTotalsPreview = {
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
};

/** Same subtotal / tax / total math as `completeSale` (single source of truth for UI). */
export async function previewTotals(lines: CartLine[], discountAmount = 0): Promise<CheckoutTotalsPreview> {
  const { rate, enabled } = await taxSettings();
  const subtotal = lines.reduce((sum, line) => sum + line.product.price * normalizeQty(line.quantity), 0);
  const taxAmount = enabled && rate > 0 ? Math.round(subtotal * (rate / 100) * 100) / 100 : 0;
  const safeDiscount = Number.isFinite(discountAmount) && discountAmount > 0 ? discountAmount : 0;
  const totalAmount = computeTotalWithDiscount(subtotal, taxAmount, safeDiscount);
  return { subtotal, taxAmount, discountAmount: safeDiscount, totalAmount };
}

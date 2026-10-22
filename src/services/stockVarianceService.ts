import { productRepository, type ProductRow } from '@/db/productRepository';
import { normalizeQty, qtyGreater } from '@/lib/quantity';
import type { CartLine } from '@/stores/cartStore';

/** One cart line that exceeds locally-known stock at commit time. */
export type StockShortage = {
  /** `CartLine.key` - used to associate variance back to the line on submit. */
  key: string;
  /** Latest catalog row (re-read from IndexedDB, not the cart snapshot). */
  product: ProductRow;
  orderedQty: number;
  availableQty: number;
};

export type StockShortageResult =
  | { ok: true; shortages: StockShortage[] }
  | { ok: false; code: 'MISSING_PRODUCT'; productId: string; productName: string };

/**
 * Resolve authoritative local stock for each non-temporary cart line and report
 * any line whose ordered quantity exceeds the catalog's `stock_quantity`.
 *
 * - Temporary products (`is_temporary === 1`) are excluded from shortage math
 *   and from variance requirements (no catalog stock to defend).
 * - Missing product rows return `MISSING_PRODUCT` so the caller can block
 *   finalization rather than fabricate `avail = 0` and force bogus variance.
 */
export async function computeStockShortages(lines: CartLine[]): Promise<StockShortageResult> {
  const shortages: StockShortage[] = [];
  for (const line of lines) {
    if (line.product.is_temporary === 1) continue;
    const fresh = await productRepository.findById(line.product.id);
    if (!fresh) {
      return {
        ok: false,
        code: 'MISSING_PRODUCT',
        productId: line.product.id,
        productName: line.product.name,
      };
    }
    const orderedQty = normalizeQty(line.quantity);
    const availableQty = normalizeQty(fresh.stock_quantity);
    if (qtyGreater(orderedQty, availableQty)) {
      shortages.push({
        key: line.key,
        product: fresh,
        orderedQty,
        availableQty,
      });
    }
  }
  return { ok: true, shortages };
}

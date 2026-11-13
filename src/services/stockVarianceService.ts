import { productRepository, type ProductRow } from '@/db/productRepository';
import {
  applyLocalSaleStock,
  tipFromProductJson,
  tryCoverWithAutoConvert,
  type WorkingStock,
} from '@/lib/autoConvertStock';
import { normalizeQty } from '@/lib/quantity';
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
 * any line whose ordered quantity cannot be covered even after auto-convert.
 *
 * - Temporary products (`is_temporary === 1`) are excluded from shortage math.
 * - Missing product rows return `MISSING_PRODUCT` so the caller can block checkout.
 * - Lines are processed sequentially with a working stock map so sibling SKUs
 *   that share a pack pool do not each assume the full parent inventory.
 * - When auto-convert can cover, the line is not a shortage (no variance modal).
 */
export async function computeStockShortages(lines: CartLine[]): Promise<StockShortageResult> {
  const shortages: StockShortage[] = [];
  const working: WorkingStock = new Map();
  const productById = new Map<string, ProductRow>();

  async function ensureProduct(id: string): Promise<ProductRow | null> {
    const cached = productById.get(id);
    if (cached) return cached;
    const row = await productRepository.findById(id);
    if (row) {
      productById.set(id, row);
      if (!working.has(id)) {
        working.set(id, normalizeQty(row.stock_quantity));
      }
    }
    return row;
  }

  for (const line of lines) {
    if (line.product.is_temporary === 1) continue;

    const fresh = await ensureProduct(line.product.id);
    if (!fresh) {
      return {
        ok: false,
        code: 'MISSING_PRODUCT',
        productId: line.product.id,
        productName: line.product.name,
      };
    }

    const tip = tipFromProductJson(fresh.auto_convert_json);
    if (tip) {
      await ensureProduct(tip.parent_product_id);
    }

    const orderedQty = normalizeQty(line.quantity);
    const cover = tryCoverWithAutoConvert(working, fresh.id, orderedQty, tip);

    if (!cover.covered) {
      shortages.push({
        key: line.key,
        product: fresh,
        orderedQty,
        availableQty: cover.availableAfter,
      });
    }

    // Always apply local mutation so later lines see the depleted pool
    // (matches server sequential convert/deduct).
    applyLocalSaleStock(working, fresh.id, orderedQty, tip);
  }

  return { ok: true, shortages };
}

import { assertBarcodeAvailable } from '@/db/barcode';
import { db, type Product } from '@/db/schema';

export type ProductRow = Product;

/** SQLite default LIKE folds ASCII letters only. */
function foldAscii(value: string): string {
  return value.replace(/[A-Za-z]/g, (ch) => ch.toLowerCase());
}

/**
 * SQLite `LIKE`: `%` and `_` are wildcards, and ASCII letters are case-insensitive.
 * Equality (`=`) stays case-sensitive and is not handled here.
 */
function likeMatch(value: string | null, pattern: string): boolean {
  if (value == null) return false;
  let source = '';
  for (const ch of foldAscii(pattern)) {
    if (ch === '%') source += '[\\s\\S]*';
    else if (ch === '_') source += '[\\s\\S]';
    else source += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`).test(foldAscii(value));
}

function rankOf(product: Product, query: string, prefix: string, contains: string): number {
  if (product.barcode === query) return 0;
  if (product.sku === query) return 1;
  if (likeMatch(product.sku, prefix)) return 2;
  if (likeMatch(product.name, prefix)) return 3;
  if (likeMatch(product.name, contains)) return 4;
  return 9;
}

function byName(a: Product, b: Product): number {
  if (a.name < b.name) return -1;
  if (a.name > b.name) return 1;
  return 0;
}

export const productRepository = {
  async upsertMany(products: Product[]): Promise<void> {
    await db.transaction('rw', db.products, async () => {
      for (const product of products) {
        await assertBarcodeAvailable(product.barcode, product.id);
        await db.products.put(product);
      }
    });
  },

  async findById(id: string): Promise<Product | null> {
    return (await db.products.get(id)) ?? null;
  },

  async markSyncedAt(id: string, syncedAt: string): Promise<void> {
    await db.products.update(id, { synced_at: syncedAt });
  },

  async deleteManyByIds(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await db.products.bulkDelete(ids);
  },

  async updateStockForMany(rows: { id: string; stock_quantity: number }[]): Promise<void> {
    await db.transaction('rw', db.products, async () => {
      for (const row of rows) {
        const existing = await db.products.get(row.id);
        if (!existing) continue;
        await db.products.update(row.id, { stock_quantity: row.stock_quantity });
      }
    });
  },

  async updateAutoConvertForMany(rows: { id: string; auto_convert_json: string | null }[]): Promise<void> {
    await db.transaction('rw', db.products, async () => {
      for (const row of rows) {
        const existing = await db.products.get(row.id);
        if (!existing) continue;
        await db.products.update(row.id, { auto_convert_json: row.auto_convert_json });
      }
    });
  },

  async findByBarcode(barcode: string): Promise<Product | null> {
    if (!barcode) return null;
    return (await db.products.where('barcode').equals(barcode).first()) ?? null;
  },

  async findBySku(sku: string): Promise<Product | null> {
    if (!sku) return null;
    return (await db.products.where('sku').equals(sku).first()) ?? null;
  },

  /**
   * Rank: exact barcode, exact SKU, SKU prefix, name prefix, name contains.
   * Dexie has no SQL `LIKE`, so ranking runs in memory over the local catalog.
   * Equality is case-sensitive. Prefix and contains follow SQLite `LIKE`.
   */
  async search(input: { query: string; limit?: number }): Promise<Product[]> {
    const q = input.query.trim();
    if (!q) return [];
    const limit = Math.max(1, Math.min(50, input.limit ?? 30));
    const all = await db.products.toArray();

    const exactBarcode = all.find((product) => product.barcode === q);
    const exactSku = all.find((product) => product.sku === q);
    const picked: Product[] = [];
    if (exactBarcode) picked.push(exactBarcode);
    if (exactSku && !picked.some((product) => product.id === exactSku.id)) picked.push(exactSku);
    if (picked.length >= limit) return picked.slice(0, limit);

    const prefix = `${q}%`;
    const contains = `%${q}%`;
    const ranked = all
      .map((product) => ({ product, rank: rankOf(product, q, prefix, contains) }))
      .filter((row) => row.rank < 9)
      .sort((a, b) => a.rank - b.rank || byName(a.product, b.product));

    for (const row of ranked) {
      if (!picked.some((product) => product.id === row.product.id)) picked.push(row.product);
      if (picked.length >= limit) break;
    }
    return picked.slice(0, limit);
  },
};

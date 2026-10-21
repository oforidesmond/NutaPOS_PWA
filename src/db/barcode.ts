import { db, type Product } from '@/db/schema';

/**
 * Dexie does not enforce SQL UNIQUE the way SQLite does. A non-unique index
 * is used so temporary products may share a null barcode. Call this before
 * inserting a product that has a barcode.
 */
export async function assertBarcodeAvailable(barcode: string | null | undefined, exceptId?: string): Promise<void> {
  if (barcode == null || barcode === '') return;
  const existing = await db.products.where('barcode').equals(barcode).first();
  if (existing && existing.id !== exceptId) {
    throw new Error('Barcode already in use');
  }
}

export async function insertProduct(product: Product): Promise<void> {
  await assertBarcodeAvailable(product.barcode, product.id);
  await db.products.add(product);
}

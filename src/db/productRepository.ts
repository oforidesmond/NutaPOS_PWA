import { assertBarcodeAvailable } from '@/db/barcode';
import { db, type Product } from '@/db/schema';

export const productRepository = {
  async upsertMany(products: Product[]): Promise<void> {
    await db.transaction('rw', db.products, async () => {
      for (const product of products) {
        await assertBarcodeAvailable(product.barcode, product.id);
        await db.products.put(product);
      }
    });
  },
};

import { insertProduct } from '@/db/barcode';
import { productRepository, type ProductRow } from '@/db/productRepository';

export type CreateTemporaryProductInput = {
  name: string;
  price: number;
  barcode?: string | null;
};

export async function createTemporaryProduct(input: CreateTemporaryProductInput): Promise<ProductRow> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const barcode = input.barcode?.trim() || null;

  await insertProduct({
    id,
    barcode,
    sku: null,
    name: input.name.trim(),
    price: input.price,
    cost_price: null,
    stock_quantity: 0,
    category_id: null,
    is_temporary: 1,
    auto_convert_json: null,
    synced_at: null,
    updated_at: now,
  });

  const created = await productRepository.findById(id);
  if (!created) {
    throw new Error('Failed to create temporary product');
  }
  return created;
}

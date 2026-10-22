import { beforeEach, describe, expect, it } from 'vitest';
import { productRepository } from '@/db/productRepository';
import { db, type Product } from '@/db/schema';

function product(overrides: Partial<Product> & Pick<Product, 'id' | 'name'>): Product {
  return {
    barcode: null,
    sku: null,
    price: 1,
    cost_price: null,
    stock_quantity: 1,
    category_id: null,
    is_temporary: 0,
    synced_at: null,
    updated_at: '2026-01-01T00:00:00.000Z',
    auto_convert_json: null,
    ...overrides,
  };
}

describe('productRepository.search', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await db.products.bulkPut([
      product({ id: 'barcode', name: 'Zebra milk', barcode: 'ABC', sku: 'OTHER' }),
      product({ id: 'sku', name: 'Zinc', barcode: '555', sku: 'ABC' }),
      product({ id: 'prefix', name: 'Mango', barcode: '000', sku: 'ABC999' }),
      product({ id: 'namePrefix', name: 'Abcd toy', barcode: '111', sku: 'QQQ' }),
      product({ id: 'contains', name: 'The abc snack', barcode: '222', sku: 'RRR' }),
    ]);
  });

  it('ranks exact barcode, exact SKU, SKU prefix, name prefix, then name contains', async () => {
    const rows = await productRepository.search({ query: 'ABC' });
    expect(rows.map((row) => row.id)).toEqual(['barcode', 'sku', 'prefix', 'namePrefix', 'contains']);
  });

  it('keeps barcode and SKU equality case-sensitive', async () => {
    const rows = await productRepository.search({ query: 'abc' });
    expect(rows.map((row) => row.id)).toEqual(['prefix', 'sku', 'namePrefix', 'contains']);
  });

  it('returns nothing for a blank query and clamps the limit', async () => {
    expect(await productRepository.search({ query: '   ' })).toEqual([]);
    const one = await productRepository.search({ query: 'ABC', limit: 1 });
    expect(one.map((row) => row.id)).toEqual(['barcode']);
  });
});

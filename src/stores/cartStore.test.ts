import { beforeEach, describe, expect, it } from 'vitest';
import { db, type Product } from '@/db/schema';
import { QTY_MAX } from '@/lib/quantity';
import { useCartStore } from '@/stores/cartStore';

function row(partial: Partial<Product> & { id: string; name: string; price: number }): Product {
  return {
    barcode: null,
    sku: null,
    cost_price: null,
    stock_quantity: 1,
    category_id: null,
    is_temporary: 0,
    auto_convert_json: null,
    synced_at: null,
    updated_at: 'now',
    ...partial,
  };
}

describe('cartStore', () => {
  beforeEach(async () => {
    useCartStore.getState().clear();
    await db.delete();
    await db.open();
  });

  it('merges the same product and removes a line at zero', () => {
    const item = row({ id: 'a', name: 'Rice', price: 4 });
    useCartStore.getState().addProduct(item);
    useCartStore.getState().addProduct(item);
    expect(useCartStore.getState().lines[0].quantity).toBe(2);
    useCartStore.getState().addQty('a', 0.25);
    expect(useCartStore.getState().lines[0].quantity).toBe(2.25);
    useCartStore.getState().addQty('a', 0.5);
    expect(useCartStore.getState().lines[0].quantity).toBe(2.75);
    useCartStore.getState().setQty('a', 0);
    expect(useCartStore.getState().lines).toEqual([]);
  });

  it('caps a line at the maximum sell quantity', () => {
    const item = row({ id: 'a', name: 'Rice', price: 4 });
    useCartStore.getState().addProduct(item);
    useCartStore.getState().setQty('a', QTY_MAX + 10);
    expect(useCartStore.getState().lines[0].quantity).toBe(QTY_MAX);
    useCartStore.getState().addProduct(item);
    expect(useCartStore.getState().lines[0].quantity).toBe(QTY_MAX);
  });

  it('refreshes product snapshots and drops deleted products', async () => {
    const stale = row({ id: 'a', name: 'Old', price: 1, stock_quantity: 2 });
    const gone = row({ id: 'b', name: 'Gone', price: 3 });
    useCartStore.getState().addProduct(stale);
    useCartStore.getState().addProduct(gone);
    await db.products.put(row({ id: 'a', name: 'New', price: 9, stock_quantity: 7 }));

    await useCartStore.getState().rehydrateFromDb();
    const lines = useCartStore.getState().lines;
    expect(lines).toHaveLength(1);
    expect(lines[0].product.name).toBe('New');
    expect(lines[0].product.price).toBe(9);
    expect(lines[0].product.stock_quantity).toBe(7);
    expect(lines[0].quantity).toBe(1);
  });
});

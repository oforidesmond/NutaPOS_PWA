import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@/db/schema';
import type { CartLine } from '@/stores/cartStore';
import { computeStockShortages } from '@/services/stockVarianceService';

const findById = vi.fn();

vi.mock('@/db/productRepository', () => ({
  productRepository: {
    findById: (...args: unknown[]) => findById(...args),
  },
}));

function product(partial: Partial<Product> & Pick<Product, 'id' | 'name'>): Product {
  return {
    sku: null,
    barcode: null,
    price: 1,
    cost_price: 0,
    category_id: null,
    stock_quantity: 0,
    is_temporary: 0,
    synced_at: null,
    updated_at: new Date().toISOString(),
    auto_convert_json: null,
    ...partial,
  };
}

function line(p: Product, quantity: number, key = p.id): CartLine {
  return { key, product: p, quantity };
}

describe('computeStockShortages auto-convert', () => {
  beforeEach(() => {
    findById.mockReset();
  });

  it('skips shortage when pack can cover zero physical child', async () => {
    const child = product({
      id: 'child-1',
      name: 'Single',
      stock_quantity: 0,
      auto_convert_json: JSON.stringify({
        parent_product_id: 'parent-1',
        parent_name: 'Pack',
        conversion_ratio: 12,
        sibling_product_ids: [],
        sibling_names: [],
      }),
    });
    const parent = product({ id: 'parent-1', name: 'Pack', stock_quantity: 1 });
    findById.mockImplementation(async (id: string) => {
      if (id === 'child-1') return child;
      if (id === 'parent-1') return parent;
      return null;
    });

    const result = await computeStockShortages([line(child, 5)]);
    expect(result).toEqual({ ok: true, shortages: [] });
  });

  it('reports shortage when parent cannot cover', async () => {
    const child = product({
      id: 'child-1',
      name: 'Single',
      stock_quantity: 0,
      auto_convert_json: JSON.stringify({
        parent_product_id: 'parent-1',
        parent_name: 'Pack',
        conversion_ratio: 12,
        sibling_product_ids: [],
        sibling_names: [],
      }),
    });
    const parent = product({ id: 'parent-1', name: 'Pack', stock_quantity: 0 });
    findById.mockImplementation(async (id: string) => {
      if (id === 'child-1') return child;
      if (id === 'parent-1') return parent;
      return null;
    });

    const result = await computeStockShortages([line(child, 5)]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.shortages).toHaveLength(1);
    expect(result.shortages[0]?.availableQty).toBe(0);
    expect(result.shortages[0]?.orderedQty).toBe(5);
  });

  it('without tip, uses raw stock comparison', async () => {
    const p = product({ id: 'p1', name: 'Plain', stock_quantity: 2 });
    findById.mockResolvedValue(p);
    const short = await computeStockShortages([line(p, 3)]);
    expect(short.ok && short.shortages).toHaveLength(1);
    const ok = await computeStockShortages([line(p, 2)]);
    expect(ok).toEqual({ ok: true, shortages: [] });
  });

  it('depletes shared parent across sequential sibling lines', async () => {
    const tip = {
      parent_product_id: 'parent-1',
      parent_name: 'Pack',
      conversion_ratio: 12,
      sibling_product_ids: ['child-2'],
      sibling_names: ['Other'],
    };
    const childA = product({
      id: 'child-1',
      name: 'A',
      stock_quantity: 0,
      auto_convert_json: JSON.stringify(tip),
    });
    const childB = product({
      id: 'child-2',
      name: 'B',
      stock_quantity: 0,
      auto_convert_json: JSON.stringify({
        ...tip,
        sibling_product_ids: ['child-1'],
        sibling_names: ['A'],
      }),
    });
    const parent = product({ id: 'parent-1', name: 'Pack', stock_quantity: 1 });
    findById.mockImplementation(async (id: string) => {
      if (id === 'child-1') return childA;
      if (id === 'child-2') return childB;
      if (id === 'parent-1') return parent;
      return null;
    });

    // First line consumes the only pack; second should be short.
    const result = await computeStockShortages([line(childA, 12), line(childB, 1, 'b')]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.shortages).toHaveLength(1);
    expect(result.shortages[0]?.key).toBe('b');
  });
});

import { describe, expect, it } from 'vitest';
import { normalizeProductsFromList, productPayloadHasAutoConvert, productPayloadHasExplicitStock } from '@/api/syncAdapter';
import { parseAutoConvertTip } from '@/lib/autoConvertTip';

describe('productPayloadHasExplicitStock', () => {
  it('is false when stock fields are absent', () => {
    expect(
      productPayloadHasExplicitStock({
        id: '1',
        name: 'X',
        price: 1,
        updated_at: '2020-01-01T00:00:00.000Z',
      }),
    ).toBe(false);
  });

  it('is true for stock_quantity', () => {
    expect(productPayloadHasExplicitStock({ id: '1', stock_quantity: 10 })).toBe(true);
  });

  it('is true for SyncService stock mirrors (currentStock / stockQuantity)', () => {
    expect(productPayloadHasExplicitStock({ id: '1', currentStock: 5 })).toBe(true);
    expect(productPayloadHasExplicitStock({ id: '1', stockQuantity: 0 })).toBe(true);
  });
});

describe('productPayloadHasAutoConvert', () => {
  it('is false when tip fields are absent', () => {
    expect(productPayloadHasAutoConvert({ id: '1', name: 'X', price: 1 })).toBe(false);
  });

  it('is true when auto_convert or autoConvert key is present', () => {
    expect(productPayloadHasAutoConvert({ id: '1', auto_convert: null })).toBe(true);
    expect(productPayloadHasAutoConvert({ id: '1', autoConvert: { parentName: 'P' } })).toBe(true);
  });
});

describe('normalizeProductsFromList stock', () => {
  it('preserves fractional currentStock (does not floor)', () => {
    const rows = normalizeProductsFromList(
      [{ id: 'p1', name: 'Rice', price: 10, currentStock: 2.5 }],
      '2026-01-01T00:00:00.000Z',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].stock_quantity).toBe(2.5);
  });

  it('normalizes stock to 3 decimal places', () => {
    const rows = normalizeProductsFromList([{ id: 'p1', name: 'Oil', price: 10, stock_quantity: 1.3339 }], null);
    expect(rows[0].stock_quantity).toBe(1.334);
  });
});

describe('normalizeProductsFromList auto_convert', () => {
  it('persists snake_case auto_convert tip JSON', () => {
    const rows = normalizeProductsFromList(
      [
        {
          id: 'half',
          name: 'Half Chicken',
          price: 20,
          auto_convert: {
            parent_product_id: 'whole',
            parent_name: 'Whole Chicken',
            conversion_ratio: 2,
            sibling_product_ids: ['quarter'],
            sibling_names: ['Quarter Chicken'],
          },
        },
      ],
      null,
    );
    expect(parseAutoConvertTip(rows[0].auto_convert_json)).toEqual({
      parent_product_id: 'whole',
      parent_name: 'Whole Chicken',
      conversion_ratio: 2,
      sibling_product_ids: ['quarter'],
      sibling_names: ['Quarter Chicken'],
    });
  });

  it('persists camelCase autoConvert tip JSON', () => {
    const rows = normalizeProductsFromList(
      [
        {
          id: 'half',
          name: 'Half Chicken',
          price: 20,
          autoConvert: {
            parentProductId: 'whole',
            parentName: 'Whole Chicken',
            conversionRatio: 2,
            siblingProductIds: [],
            siblingNames: [],
          },
        },
      ],
      null,
    );
    expect(parseAutoConvertTip(rows[0].auto_convert_json)?.parent_name).toBe('Whole Chicken');
  });

  it('stores null when tip is omitted (not an auto-convert child)', () => {
    const rows = normalizeProductsFromList([{ id: 'p1', name: 'Soap', price: 5 }], null);
    expect(rows[0].auto_convert_json).toBeNull();
  });
});

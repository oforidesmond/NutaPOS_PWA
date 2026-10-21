import { describe, expect, it } from 'vitest';
import {
  formatAutoConvertTip,
  formatAutoConvertTipFromJson,
  normalizeAutoConvertTip,
  parseAutoConvertTip,
  serializeAutoConvertTip,
} from '@/lib/autoConvertTip';

describe('normalizeAutoConvertTip', () => {
  it('accepts snake_case payload', () => {
    expect(
      normalizeAutoConvertTip({
        parent_product_id: 'p-whole',
        parent_name: 'Whole Chicken',
        conversion_ratio: 2,
        sibling_product_ids: ['p-q'],
        sibling_names: ['Quarter Chicken'],
      }),
    ).toEqual({
      parent_product_id: 'p-whole',
      parent_name: 'Whole Chicken',
      conversion_ratio: 2,
      sibling_product_ids: ['p-q'],
      sibling_names: ['Quarter Chicken'],
    });
  });

  it('accepts camelCase aliases', () => {
    expect(
      normalizeAutoConvertTip({
        parentProductId: 'p-whole',
        parentName: 'Whole Chicken',
        conversionRatio: 2,
        siblingProductIds: [],
        siblingNames: [],
      }),
    ).toMatchObject({
      parent_product_id: 'p-whole',
      parent_name: 'Whole Chicken',
      conversion_ratio: 2,
      sibling_names: [],
    });
  });

  it('returns null for invalid payloads', () => {
    expect(normalizeAutoConvertTip(null)).toBeNull();
    expect(normalizeAutoConvertTip({ parent_name: 'X' })).toBeNull();
  });
});

describe('formatAutoConvertTip', () => {
  it('formats parent-only tip', () => {
    expect(
      formatAutoConvertTip({
        parent_product_id: 'p',
        parent_name: 'Whole Chicken',
        conversion_ratio: 2,
        sibling_product_ids: [],
        sibling_names: [],
      }),
    ).toBe('From Whole Chicken');
  });

  it('includes sibling names when present', () => {
    expect(
      formatAutoConvertTip({
        parent_product_id: 'p',
        parent_name: 'Whole Chicken',
        conversion_ratio: 2,
        sibling_product_ids: ['q'],
        sibling_names: ['Quarter Chicken'],
      }),
    ).toBe('From Whole Chicken · May share pack stock with Quarter Chicken');
  });
});

describe('parse / serialize', () => {
  it('round-trips tip JSON', () => {
    const tip = normalizeAutoConvertTip({
      parent_product_id: 'p',
      parent_name: 'Whole Chicken',
      conversion_ratio: 2,
      sibling_product_ids: [],
      sibling_names: [],
    })!;
    const json = serializeAutoConvertTip(tip);
    expect(parseAutoConvertTip(json)).toEqual(tip);
  });

  it('returns null for invalid JSON', () => {
    expect(parseAutoConvertTip('not-json')).toBeNull();
    expect(formatAutoConvertTipFromJson(null)).toBeNull();
  });
});

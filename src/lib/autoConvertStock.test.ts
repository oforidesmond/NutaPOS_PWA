import { describe, expect, it } from 'vitest';
import {
  applyLocalSaleStock,
  derivePhysicalChild,
  floorParentContribution,
  packsNeededForShortfall,
  tryCoverWithAutoConvert,
} from '@/lib/autoConvertStock';
import type { AutoConvertTip } from '@/lib/autoConvertTip';

const tip: AutoConvertTip = {
  parent_product_id: 'parent-1',
  parent_name: 'Pack',
  conversion_ratio: 12,
  sibling_product_ids: [],
  sibling_names: [],
};

describe('autoConvertStock math', () => {
  it('floorParentContribution matches staff formula', () => {
    expect(floorParentContribution(3, 2)).toBe(6);
    expect(floorParentContribution(1, 12)).toBe(12);
  });

  it('packsNeededForShortfall uses ceil', () => {
    expect(packsNeededForShortfall(5, 12)).toBe(1);
    expect(packsNeededForShortfall(13, 12)).toBe(2);
    expect(packsNeededForShortfall(0, 12)).toBe(0);
  });

  it('derivePhysicalChild strips pack contribution from effective', () => {
    // effective 17 = phys 5 + floor(1*12)
    expect(derivePhysicalChild(17, 1, 12)).toBe(5);
    expect(derivePhysicalChild(12, 1, 12)).toBe(0);
  });
});

describe('tryCoverWithAutoConvert', () => {
  it('covers when pack can break for zero physical child', () => {
    const working = new Map([
      ['child-1', 12], // effective: 0 phys + 1 pack
      ['parent-1', 1],
    ]);
    const result = tryCoverWithAutoConvert(working, 'child-1', 5, tip);
    expect(result.covered).toBe(true);
    expect(result.packsNeeded).toBe(1);
  });

  it('covers when selling within physical child only', () => {
    const working = new Map([
      ['child-1', 17],
      ['parent-1', 1],
    ]);
    const result = tryCoverWithAutoConvert(working, 'child-1', 5, tip);
    expect(result.covered).toBe(true);
    expect(result.packsNeeded).toBe(0);
  });

  it('does not cover when parent packs are insufficient', () => {
    const working = new Map([
      ['child-1', 0],
      ['parent-1', 0],
    ]);
    const result = tryCoverWithAutoConvert(working, 'child-1', 5, tip);
    expect(result.covered).toBe(false);
    expect(result.availableAfter).toBe(0);
  });

  it('without tip, compares ordered to child stock only', () => {
    const working = new Map([['child-1', 2]]);
    expect(tryCoverWithAutoConvert(working, 'child-1', 3, null).covered).toBe(false);
    expect(tryCoverWithAutoConvert(working, 'child-1', 2, null).covered).toBe(true);
  });
});

describe('applyLocalSaleStock', () => {
  it('breaks pack and updates parent + child effective', () => {
    const working = new Map([
      ['child-1', 12],
      ['parent-1', 1],
    ]);
    const updates = applyLocalSaleStock(working, 'child-1', 5, tip);
    expect(working.get('parent-1')).toBe(0);
    expect(working.get('child-1')).toBe(7); // broke 1 pack → 12, sold 5 → 7
    expect(updates).toEqual(
      expect.arrayContaining([
        { id: 'child-1', stock_quantity: 7 },
        { id: 'parent-1', stock_quantity: 0 },
      ]),
    );
  });

  it('decrements child only when physical covers', () => {
    const working = new Map([
      ['child-1', 17],
      ['parent-1', 1],
    ]);
    applyLocalSaleStock(working, 'child-1', 3, tip);
    expect(working.get('parent-1')).toBe(1);
    expect(working.get('child-1')).toBe(14);
  });

  it('allows negative child on true variance without touching parent', () => {
    const working = new Map([
      ['child-1', 2],
      ['parent-1', 0],
    ]);
    applyLocalSaleStock(working, 'child-1', 5, tip);
    expect(working.get('parent-1')).toBe(0);
    expect(working.get('child-1')).toBe(-3);
  });
});

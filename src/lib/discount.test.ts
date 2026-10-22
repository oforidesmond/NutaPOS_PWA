import { describe, expect, it } from 'vitest';
import {
  computeDiscountPercent,
  computeTotalWithDiscount,
  maxDiscountAmount,
  validateDiscount,
} from '@/lib/discount';

describe('discount', () => {
  describe('computeDiscountPercent', () => {
    it('returns 0 when no discount', () => {
      expect(computeDiscountPercent(0, 100)).toBe(0);
    });

    it('computes percent from amount and subtotal', () => {
      expect(computeDiscountPercent(15, 100)).toBe(15);
      expect(computeDiscountPercent(10, 50)).toBe(20);
    });

    it('returns 100 when discount on zero subtotal with positive discount', () => {
      expect(computeDiscountPercent(5, 0)).toBe(100);
    });
  });

  describe('maxDiscountAmount', () => {
    it('returns cap amount in currency', () => {
      expect(maxDiscountAmount(100, 15)).toBe(15);
      expect(maxDiscountAmount(50, 10)).toBe(5);
    });
  });

  describe('computeTotalWithDiscount', () => {
    it('subtracts discount after tax', () => {
      expect(computeTotalWithDiscount(100, 12.5, 10)).toBe(102.5);
    });
  });

  describe('validateDiscount', () => {
    const base = { subtotal: 100, maxPercent: 15, enabled: true };

    it('allows zero or negative discount', () => {
      expect(validateDiscount({ ...base, discountAmount: 0 }).ok).toBe(true);
      expect(validateDiscount({ ...base, discountAmount: -1 }).ok).toBe(true);
    });

    it('rejects discount when disabled', () => {
      const r = validateDiscount({ ...base, discountAmount: 5, enabled: false });
      expect(r.ok).toBe(false);
      if (r.ok === false) {
        expect(r.message).toMatch(/not permitted/i);
      }
    });

    it('rejects discount on zero subtotal', () => {
      const r = validateDiscount({ ...base, subtotal: 0, discountAmount: 5 });
      expect(r.ok).toBe(false);
    });

    it('allows discount exactly at cap', () => {
      expect(validateDiscount({ ...base, discountAmount: 15 }).ok).toBe(true);
    });

    it('rejects discount over cap', () => {
      const r = validateDiscount({ ...base, discountAmount: 20 });
      expect(r.ok).toBe(false);
      if (r.ok === false) {
        expect(r.message).toMatch(/Maximum discount is 15%/);
      }
    });

    it('rejects when maxPercent is 0', () => {
      const r = validateDiscount({ ...base, discountAmount: 1, maxPercent: 0 });
      expect(r.ok).toBe(false);
    });
  });
});

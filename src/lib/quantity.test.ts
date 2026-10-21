import { describe, expect, it } from 'vitest';
import {
  QTY_HALF,
  QTY_MAX,
  QTY_MIN,
  QTY_QUARTER,
  addQtyValues,
  formatQty,
  isValidSellQty,
  normalizeQty,
  parseQtyInput,
  qtyGreater,
} from '@/lib/quantity';

describe('quantity', () => {
  describe('normalizeQty', () => {
    it('rounds to 3 decimal places', () => {
      expect(normalizeQty(0.3333)).toBe(0.333);
      expect(normalizeQty(0.3335)).toBe(0.334);
      expect(normalizeQty(1.75)).toBe(1.75);
    });

    it('fixes float drift', () => {
      expect(normalizeQty(0.1 + 0.2)).toBe(0.3);
    });

    it('returns 0 for non-finite', () => {
      expect(normalizeQty(Number.NaN)).toBe(0);
      expect(normalizeQty(Number.POSITIVE_INFINITY)).toBe(0);
    });
  });

  describe('isValidSellQty', () => {
    it('accepts half and quarter', () => {
      expect(isValidSellQty(QTY_HALF)).toBe(true);
      expect(isValidSellQty(QTY_QUARTER)).toBe(true);
      expect(isValidSellQty(QTY_MIN)).toBe(true);
    });

    it('rejects below min, zero, and above max', () => {
      expect(isValidSellQty(0)).toBe(false);
      expect(isValidSellQty(0.0004)).toBe(false);
      expect(isValidSellQty(QTY_MAX + 1)).toBe(false);
      expect(isValidSellQty(Number.NaN)).toBe(false);
    });
  });

  describe('parseQtyInput', () => {
    it('parses decimals and normalizes', () => {
      expect(parseQtyInput('0.5')).toBe(0.5);
      expect(parseQtyInput('1.75')).toBe(1.75);
      expect(parseQtyInput('0.3333')).toBe(0.333);
      expect(parseQtyInput(' 2 ')).toBe(2);
    });

    it('accepts comma as thousand separator strip via remove', () => {
      expect(parseQtyInput('1,250.5')).toBe(1250.5);
    });

    it('returns null for empty or invalid', () => {
      expect(parseQtyInput('')).toBeNull();
      expect(parseQtyInput('.')).toBeNull();
      expect(parseQtyInput('abc')).toBeNull();
      expect(parseQtyInput('-1')).toBeNull();
    });

    it('allows zero (caller decides remove vs invalid sell)', () => {
      expect(parseQtyInput('0')).toBe(0);
    });
  });

  describe('formatQty', () => {
    it('strips trailing zeros', () => {
      expect(formatQty(2)).toBe('2');
      expect(formatQty(0.5)).toBe('0.5');
      expect(formatQty(1.25)).toBe('1.25');
      expect(formatQty(0.25)).toBe('0.25');
      expect(formatQty(1.001)).toBe('1.001');
    });

    it('formats zero', () => {
      expect(formatQty(0)).toBe('0');
    });
  });

  describe('qtyGreater / addQtyValues', () => {
    it('compares at 3dp', () => {
      expect(qtyGreater(0.5, 0.499)).toBe(true);
      expect(qtyGreater(0.5, 0.5)).toBe(false);
    });

    it('adds without drift', () => {
      expect(addQtyValues(0.1, 0.2)).toBe(0.3);
      expect(addQtyValues(0.25, 0.5)).toBe(0.75);
    });
  });
});

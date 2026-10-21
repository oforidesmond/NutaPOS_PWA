/** Match backend Prisma Decimal(12, 3) for stock and sale quantities. */
export const QTY_SCALE = 1000;
export const QTY_MIN = 0.001;
export const QTY_MAX = 999999.999;
export const QTY_HALF = 0.5;
export const QTY_QUARTER = 0.25;

/** Round to 3 decimal places (avoids float drift like 0.1 + 0.2). */
export function normalizeQty(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * QTY_SCALE) / QTY_SCALE;
}

/** True when qty is a finite sellable amount within scale and bounds. */
export function isValidSellQty(n: number): boolean {
  if (!Number.isFinite(n)) return false;
  const q = normalizeQty(n);
  return q >= QTY_MIN && q <= QTY_MAX;
}

/**
 * Parse user text into a normalized qty, or null if empty/invalid.
 * Normalizes on success (e.g. "0.3333" → 0.333).
 */
export function parseQtyInput(text: string): number | null {
  const trimmed = text.trim().replace(/,/g, '');
  if (trimmed === '' || trimmed === '.' || trimmed === '-') return null;
  if (!/^-?\d*\.?\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  const q = normalizeQty(n);
  if (q < 0) return null;
  return q;
}

/** Display qty without useless trailing zeros (`0.5`, `1.25`, `2`). */
export function formatQty(n: number): string {
  const q = normalizeQty(n);
  if (Object.is(q, -0) || q === 0) return '0';
  // toFixed(3) then strip trailing zeros / decimal point
  return q.toFixed(3).replace(/\.?0+$/, '');
}

/** Compare two quantities at 3dp precision (a > b). */
export function qtyGreater(a: number, b: number): boolean {
  return normalizeQty(a) > normalizeQty(b);
}

/** Add two quantities with normalize. */
export function addQtyValues(a: number, b: number): number {
  return normalizeQty(normalizeQty(a) + normalizeQty(b));
}

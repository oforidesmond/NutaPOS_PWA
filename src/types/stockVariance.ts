/**
 * Stock variance contract — must match backend StaffSaleItemUploadDto enum.
 * Wire values are the uppercase English literals; never localize them.
 */

export const VARIANCE_REASONS = [
  'PHYSICAL_STOCK_PRESENT',
  'PACK_BROKEN',
  'STOCK_NOT_RECEIVED',
  'EMERGENCY_SALE',
  'SYSTEM_ERROR',
  'OTHER',
] as const;

export type VarianceReason = (typeof VARIANCE_REASONS)[number];

/** Staff-facing labels (UI only — JSON value stays the literal above). */
export const VARIANCE_REASON_LABELS: Record<VarianceReason, string> = {
  PHYSICAL_STOCK_PRESENT: 'Item was on the shelf / in store physically',
  PACK_BROKEN: 'Sold from opened pack / box',
  STOCK_NOT_RECEIVED: 'Goods here but not received in system',
  EMERGENCY_SALE: 'Urgent / customer-critical',
  SYSTEM_ERROR: 'Known app / system mismatch',
  OTHER: 'Other (explain below)',
};

/** Variance metadata for one short cart line. */
export type LineVariance = {
  varianceReason: VarianceReason;
  /** Optional unless varianceReason === 'OTHER'; trimmed empty → omitted on the wire. */
  varianceNote?: string;
};

/** Per-cart-line variance map keyed by `CartLine.key`. */
export type VarianceByLineKey = Record<string, LineVariance>;

export type VarianceDraftEntry = {
  reason: VarianceReason | null;
  note: string;
};

/** Modal gate. `completeSale` does not enforce this. */
export function varianceDraftMessage(productName: string, entry: VarianceDraftEntry | undefined): string | null {
  if (!entry?.reason) return `Select a reason for ${productName}.`;
  if (entry.reason === 'OTHER' && entry.note.trim().length === 0) {
    return `Add a note for ${productName} when using Other.`;
  }
  return null;
}

/**
 * Server 400 messages (canonical strings — used for diagnostics + recovery flow).
 */
export const VARIANCE_400_REASON_REQUIRED = 'varianceReason is required when selling with insufficient system stock';
export const VARIANCE_400_NOTE_REQUIRED = 'varianceNote is required when varianceReason is OTHER';

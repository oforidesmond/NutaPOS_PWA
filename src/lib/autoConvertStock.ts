import { parseAutoConvertTip, type AutoConvertTip } from '@/lib/autoConvertTip';
import { normalizeQty } from '@/lib/quantity';

export type WorkingStock = Map<string, number>;

/** floor(parentStock × ratio) at 3dp qty precision. */
export function floorParentContribution(parentStock: number, ratio: number): number {
  const p = normalizeQty(parentStock);
  const r = normalizeQty(ratio);
  if (p <= 0 || r <= 0) return 0;
  return Math.floor(normalizeQty(p * r) + 1e-9);
}

/** ceil(shortfall / ratio) packs needed to cover shortfall. */
export function packsNeededForShortfall(shortfall: number, ratio: number): number {
  const s = normalizeQty(shortfall);
  const r = normalizeQty(ratio);
  if (s <= 0 || r <= 0) return 0;
  return Math.ceil(s / r - 1e-9);
}

/**
 * Derive physical child from stored effective sellable:
 * effective = childPhys + floor(parentPhys × ratio).
 */
export function derivePhysicalChild(
  effectiveChildStock: number,
  parentStock: number,
  ratio: number,
): number {
  const fromParent = floorParentContribution(parentStock, ratio);
  return Math.max(0, normalizeQty(normalizeQty(effectiveChildStock) - fromParent));
}

export function effectiveSellable(
  childPhys: number,
  parentStock: number,
  ratio: number,
): number {
  return normalizeQty(normalizeQty(childPhys) + floorParentContribution(parentStock, ratio));
}

export type AutoConvertCoverResult = {
  covered: boolean;
  packsNeeded: number;
  /** Max qty that can be sold after converting all usable parent packs. */
  availableAfter: number;
};

/**
 * Mirror server ensureChildStockViaAutoConvert coverage check against a
 * mutable working stock map (PWA stores effective sellable on children and
 * physical on parents).
 */
export function tryCoverWithAutoConvert(
  working: WorkingStock,
  childId: string,
  orderedQty: number,
  tip: AutoConvertTip | null,
): AutoConvertCoverResult {
  const ordered = normalizeQty(orderedQty);
  const childStock = normalizeQty(working.get(childId) ?? 0);

  if (!tip) {
    return {
      covered: ordered <= childStock,
      packsNeeded: 0,
      availableAfter: childStock,
    };
  }

  const parentId = tip.parent_product_id;
  const ratio = tip.conversion_ratio;
  const parentStock = normalizeQty(working.get(parentId) ?? 0);
  const childPhys = derivePhysicalChild(childStock, parentStock, ratio);
  const maxSellable = effectiveSellable(childPhys, parentStock, ratio);

  if (ordered <= childPhys) {
    return { covered: true, packsNeeded: 0, availableAfter: maxSellable };
  }

  const shortfall = normalizeQty(ordered - childPhys);
  const packsNeeded = packsNeededForShortfall(shortfall, ratio);
  if (packsNeeded > 0 && parentStock >= packsNeeded) {
    return { covered: true, packsNeeded, availableAfter: maxSellable };
  }

  return { covered: false, packsNeeded, availableAfter: maxSellable };
}

/**
 * Apply local stock for selling `orderedQty` of child (mutates `working`).
 * When auto-convert can cover, breaks packs on the parent then deducts the sale.
 * When it cannot, only decrements child effective (may go negative) — parent unchanged.
 */
export function applyLocalSaleStock(
  working: WorkingStock,
  childId: string,
  orderedQty: number,
  tip: AutoConvertTip | null,
): { id: string; stock_quantity: number }[] {
  const ordered = normalizeQty(orderedQty);
  const childStock = normalizeQty(working.get(childId) ?? 0);

  if (!tip) {
    const next = normalizeQty(childStock - ordered);
    working.set(childId, next);
    return [{ id: childId, stock_quantity: next }];
  }

  const parentId = tip.parent_product_id;
  const ratio = tip.conversion_ratio;
  let parentStock = normalizeQty(working.get(parentId) ?? 0);
  let childPhys = derivePhysicalChild(childStock, parentStock, ratio);

  const shortfall = Math.max(0, normalizeQty(ordered - childPhys));
  const packsNeeded = packsNeededForShortfall(shortfall, ratio);
  const canConvert = packsNeeded > 0 && parentStock >= packsNeeded;

  if (canConvert) {
    parentStock = normalizeQty(parentStock - packsNeeded);
    childPhys = normalizeQty(childPhys + packsNeeded * ratio);
    childPhys = normalizeQty(childPhys - ordered);
    const nextChild = effectiveSellable(childPhys, parentStock, ratio);
    working.set(childId, nextChild);
    working.set(parentId, parentStock);
    return [
      { id: childId, stock_quantity: nextChild },
      { id: parentId, stock_quantity: parentStock },
    ];
  }

  // Covered by physical child only, or true variance (oversell).
  if (packsNeeded === 0) {
    childPhys = normalizeQty(childPhys - ordered);
    const nextChild = effectiveSellable(childPhys, parentStock, ratio);
    working.set(childId, nextChild);
    return [{ id: childId, stock_quantity: nextChild }];
  }

  // Insufficient parent packs: decrement effective as before (may go negative).
  const next = normalizeQty(childStock - ordered);
  working.set(childId, next);
  return [{ id: childId, stock_quantity: next }];
}

export function tipFromProductJson(autoConvertJson: string | null | undefined): AutoConvertTip | null {
  return parseAutoConvertTip(autoConvertJson);
}

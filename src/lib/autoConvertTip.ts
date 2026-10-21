export type AutoConvertTip = {
  parent_product_id: string;
  parent_name: string;
  conversion_ratio: number;
  sibling_product_ids: string[];
  sibling_names: string[];
};

function asString(v: unknown): string | null {
  if (typeof v === 'string' && v.trim() !== '') return v.trim();
  return null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((s) => s.trim());
}

/**
 * Normalize snake_case / camelCase auto_convert payload into a stable tip object.
 * Returns null when the value is missing or not a usable tip.
 */
export function normalizeAutoConvertTip(raw: unknown): AutoConvertTip | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const parentId = asString(o.parent_product_id ?? o.parentProductId);
  const parentName = asString(o.parent_name ?? o.parentName);
  const ratio = asNumber(o.conversion_ratio ?? o.conversionRatio);
  if (!parentId || !parentName || ratio == null) return null;
  return {
    parent_product_id: parentId,
    parent_name: parentName,
    conversion_ratio: ratio,
    sibling_product_ids: asStringArray(o.sibling_product_ids ?? o.siblingProductIds),
    sibling_names: asStringArray(o.sibling_names ?? o.siblingNames),
  };
}

export function serializeAutoConvertTip(tip: AutoConvertTip | null): string | null {
  if (!tip) return null;
  return JSON.stringify(tip);
}

export function parseAutoConvertTip(json: string | null | undefined): AutoConvertTip | null {
  if (json == null || json === '') return null;
  try {
    return normalizeAutoConvertTip(JSON.parse(json) as unknown);
  } catch {
    return null;
  }
}

/** Soft cashier-facing line; no conversion math. */
export function formatAutoConvertTip(tip: AutoConvertTip): string {
  const base = `From ${tip.parent_name}`;
  if (tip.sibling_names.length === 0) return base;
  return `${base} · May share pack stock with ${tip.sibling_names.join(', ')}`;
}

export function formatAutoConvertTipFromJson(json: string | null | undefined): string | null {
  const tip = parseAutoConvertTip(json);
  return tip ? formatAutoConvertTip(tip) : null;
}

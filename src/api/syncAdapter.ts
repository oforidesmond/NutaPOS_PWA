import { api } from '@/api/client';
import type { Product } from '@/db/schema';
import { buildApiPath } from '@/lib/env';
import { normalizeAutoConvertTip, serializeAutoConvertTip } from '@/lib/autoConvertTip';
import { normalizeQty } from '@/lib/quantity';
import type { OrganizationDto } from '@/types/organization';

/**
 * Product JSON shapes (Nuta backend):
 * - `GET /sync/initial-pull`: SyncService.mapProduct - includes `currentStock`, `stock_quantity`,
 *   `stockQuantity` (same value), price aliases, category, temp flags, optional `auto_convert`, etc.
 * - `GET /staff/master-data` delta: sell-critical product rows (price aliases, category, temp, optional
 *   `auto_convert`) plus deletes/org/categories/settings. Stock may be present for compat; on refresh
 *   inventory remains SoT — see `masterDataPull` preserve + `GET /staff/inventory` merge.
 *
 * Mobile fetchers catch transport errors and return null, so their retry loop never runs.
 * These fetchers throw. `runInitialDataSync` retries each step up to 3 times.
 */

export type InitialPullResponse = {
  organization?: OrganizationDto;
  products?: unknown[];
  categories?: unknown[];
  syncTimestamp?: string;
};

function toNumber(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return fallback;
}

/** True if payload includes stock (initial-pull / inventory only; master-data delta omits these). */
export function productPayloadHasExplicitStock(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  return (['currentStock', 'stock_quantity', 'stockQuantity'] as const).some(
    (k) => k in o && o[k] !== undefined && o[k] !== null,
  );
}

/** True when payload explicitly includes auto_convert (key present; value may be null). */
export function productPayloadHasAutoConvert(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  return 'auto_convert' in o || 'autoConvert' in o;
}

function mapAutoConvertJson(raw: Record<string, unknown>): string | null {
  if (!productPayloadHasAutoConvert(raw)) return null;
  const tip = normalizeAutoConvertTip(raw.auto_convert ?? raw.autoConvert);
  return serializeAutoConvertTip(tip);
}

function mapProduct(raw: Record<string, unknown>, syncedAt: string | null): Product | null {
  const id = (raw.id as string) ?? '';
  if (!id) return null;
  const name = (raw.name as string) ?? 'Item';
  const barcode = (raw.barcode as string) ?? null;
  /** Backend initial-pull omits `sku` today; keep fallbacks for forwards-compat / other payloads. */
  const sku = (raw.sku ?? raw.item_code ?? raw.product_code ?? raw.code) as string | null | undefined;
  /** initial-pull: sellingPrice + price + selling_price; master-data delta: `price` only. */
  const selling = raw.sellingPrice ?? raw.price ?? raw.selling_price;
  /** initial-pull: costPrice + cost_price; master-data delta: `cost_price` only. */
  const cost = raw.costPrice ?? raw.cost_price;
  /** Align with SyncService.mapProduct (initial-pull). Master-data omits - then toNumber → 0 unless preserve/merge. */
  const stock = raw.currentStock ?? raw.stock_quantity ?? raw.stockQuantity;
  const categoryId = (raw.categoryId ?? raw.category_id) as string | null;
  const isTemporary = raw.isTemporary ?? raw.is_temporary;
  const updatedAt = (raw.updatedAt ?? raw.updated_at ?? new Date().toISOString()) as string;
  return {
    id,
    barcode,
    sku: typeof sku === 'string' && sku.trim() !== '' ? sku.trim() : null,
    name,
    price: toNumber(selling),
    cost_price: cost != null ? toNumber(cost) : null,
    stock_quantity: normalizeQty(toNumber(stock)),
    category_id: categoryId ?? null,
    is_temporary: isTemporary ? 1 : 0,
    auto_convert_json: mapAutoConvertJson(raw),
    synced_at: syncedAt,
    updated_at: updatedAt,
  };
}

export async function fetchInitialPull(): Promise<InitialPullResponse> {
  const url = buildApiPath('/sync/initial-pull');
  const { data } = await api.get<InitialPullResponse | null>(url);
  return data ?? {};
}

export async function fetchStaffInventory(): Promise<unknown[]> {
  const url = buildApiPath('/staff/inventory');
  const { data } = await api.get<unknown>(url);
  const list = Array.isArray(data) ? data : (data as { products?: unknown[] } | null)?.products;
  return list ?? [];
}

export async function fetchStaffPricing(): Promise<unknown[]> {
  const url = buildApiPath('/staff/pricing');
  const { data } = await api.get<unknown>(url);
  const list = Array.isArray(data)
    ? data
    : ((data as { products?: unknown[] } | null)?.products ?? (data as { prices?: unknown[] } | null)?.prices);
  return Array.isArray(list) ? list : [];
}

export async function fetchStaffTaxSettings(): Promise<Record<string, unknown>> {
  const url = buildApiPath('/staff/settings/tax');
  const { data } = await api.get<Record<string, unknown> | null>(url);
  return data ?? {};
}

export async function fetchStaffCategories(): Promise<unknown[]> {
  const url = buildApiPath('/staff/categories');
  const { data } = await api.get<unknown>(url);
  if (Array.isArray(data)) return data;
  return (data as { categories?: unknown[] } | null)?.categories ?? [];
}

export function normalizeProductsFromInitialPull(res: InitialPullResponse): Product[] {
  const ts = res.syncTimestamp ?? null;
  const rows: Product[] = [];
  for (const p of res.products ?? []) {
    if (!p || typeof p !== 'object') continue;
    const row = mapProduct(p as Record<string, unknown>, ts);
    if (row) rows.push(row);
  }
  return rows;
}

export function normalizeProductsFromList(list: unknown[] | null | undefined, syncedAt: string | null): Product[] {
  const rows: Product[] = [];
  for (const p of list ?? []) {
    if (!p || typeof p !== 'object') continue;
    const row = mapProduct(p as Record<string, unknown>, syncedAt);
    if (row) rows.push(row);
  }
  return rows;
}

import { getStoredAccessToken } from '@/api/client';
import { fetchMasterDataWithResult, type MasterDataResponse } from '@/api/masterDataApi';
import { fetchTrialStatus } from '@/api/trialApi';
import {
  fetchStaffInventory,
  normalizeProductsFromList,
  productPayloadHasAutoConvert,
  productPayloadHasExplicitStock,
} from '@/api/syncAdapter';
import { prefsRepository } from '@/db/prefsRepository';
import { productRepository } from '@/db/productRepository';
import { settingsRepository } from '@/db/settingsRepository';
import { trialRepository } from '@/db/trialRepository';
import { mergeCategories } from '@/lib/categoriesStore';
import { readActiveBranchId } from '@/lib/jwtClaims';
import { normalizeOrg } from '@/lib/normalizeOrg';
import { showToast } from '@/components/toast';
import { syncBranchFromAccessToken } from '@/services/userProfileStore';
import { useCartStore } from '@/stores/cartStore';
import type { Product } from '@/db/schema';

export type PullMasterDataResult = {
  outcome: 'changed' | 'unchanged' | 'failed' | 'skipped';
  fullResyncRecommended?: boolean;
};

const EPOCH = '1970-01-01T00:00:00.000Z';
const MAX_PAGES = 50;

let masterDataPullInFlight: Promise<PullMasterDataResult> | null = null;

async function mergeStockFromStaffInventory(): Promise<void> {
  try {
    const inv = await fetchStaffInventory();
    if (!inv?.length) return;
    const now = new Date().toISOString();
    const rows = normalizeProductsFromList(inv, now);
    if (!rows.length) return;
    await productRepository.updateStockForMany(rows.map((r) => ({ id: r.id, stock_quantity: r.stock_quantity })));
    await productRepository.updateAutoConvertForMany(
      rows.map((r) => ({ id: r.id, auto_convert_json: r.auto_convert_json })),
    );
  } catch {
    // Inventory is merged best-effort. The delta page is already stored.
  }
}

async function applyPreservedStockFromLocal(rawList: unknown[], rows: Product[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 1) {
    const raw = rawList[i];
    if (productPayloadHasExplicitStock(raw)) continue;
    const existing = await productRepository.findById(rows[i].id);
    if (existing) {
      rows[i] = { ...rows[i], stock_quantity: existing.stock_quantity };
    }
  }
}

async function applyPreservedAutoConvertFromLocal(rawList: unknown[], rows: Product[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 1) {
    const raw = rawList[i];
    if (productPayloadHasAutoConvert(raw)) continue;
    const existing = await productRepository.findById(rows[i].id);
    if (existing) {
      rows[i] = { ...rows[i], auto_convert_json: existing.auto_convert_json };
    }
  }
}

async function mergeTaxSettings(tax: Record<string, unknown>): Promise<void> {
  const existing = (await settingsRepository.getJson<Record<string, unknown>>(settingsRepository.keys.taxSettings)) ?? {};
  await settingsRepository.setJson(settingsRepository.keys.taxSettings, {
    ...existing,
    defaultTaxRate: tax.tax_rate ?? tax.defaultTaxRate ?? existing.defaultTaxRate ?? 0,
    taxEnabled: tax.tax_enabled ?? tax.taxEnabled ?? existing.taxEnabled ?? false,
    maxDiscountPercent: tax.max_discount_percent ?? existing.maxDiscountPercent ?? 0,
    discountEnabled: tax.discount_enabled ?? existing.discountEnabled ?? false,
  });
}

async function applyMasterDataPage(data: MasterDataResponse, syncedAt: string): Promise<boolean> {
  let applied = false;

  const rawList = Array.isArray(data.products) ? data.products : [];
  if (rawList.length > 0) {
    const rows = normalizeProductsFromList(rawList, syncedAt);
    await applyPreservedStockFromLocal(rawList, rows);
    await applyPreservedAutoConvertFromLocal(rawList, rows);
    await productRepository.upsertMany(rows);
    applied = true;
  }

  const deletedIds = Array.isArray(data.deleted_product_ids)
    ? data.deleted_product_ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  if (deletedIds.length > 0) {
    await productRepository.deleteManyByIds(deletedIds);
    applied = true;
  }

  const hasCategoryUpserts = Array.isArray(data.categories) && data.categories.length > 0;
  const deletedCategoryIds = Array.isArray(data.deleted_category_ids)
    ? data.deleted_category_ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  if (hasCategoryUpserts || deletedCategoryIds.length > 0) {
    await mergeCategories({
      upserts: data.categories ?? [],
      deletedIds: deletedCategoryIds,
    });
    applied = true;
  }

  if (data.settings && typeof data.settings === 'object') {
    await mergeTaxSettings(data.settings);
    applied = true;
  }

  if (data.organization && typeof data.organization === 'object') {
    const org = normalizeOrg(data.organization);
    if (org) {
      const existing =
        (await settingsRepository.getJson<Record<string, unknown>>(settingsRepository.keys.organization)) ?? {};
      await settingsRepository.setJson(settingsRepository.keys.organization, { ...existing, ...org });
      applied = true;
    }
  }

  return applied;
}

/** Overwrites local sales_count only when the server value differs. */
async function refreshTrialCountFromServer(): Promise<void> {
  try {
    const remote = await fetchTrialStatus();
    const remoteCount = remote?.sales_count ?? remote?.salesCount;
    if (typeof remoteCount !== 'number') return;
    const row = await trialRepository.get();
    if (!row || row.sales_count === remoteCount) return;
    await trialRepository.setSalesCountFromServer(remoteCount);
  } catch {
    // A trial refresh must not fail the catalog pull.
  }
}

async function pullMasterDataImpl(): Promise<PullMasterDataResult> {
  if (!(await getStoredAccessToken())) {
    return { outcome: 'skipped' };
  }

  const token = await getStoredAccessToken();
  await syncBranchFromAccessToken();
  if (token) readActiveBranchId(token);

  const storedSince = await prefsRepository.get<string>(prefsRepository.keys.lastMasterDataPull);
  let since = typeof storedSince === 'string' && storedSince.length > 0 ? storedSince : EPOCH;
  let outcome: PullMasterDataResult['outcome'] = 'unchanged';
  let fullResyncRecommended = false;
  let pagesApplied = 0;
  const now = new Date().toISOString();
  let fetchFailed = false;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const fetched = await fetchMasterDataWithResult({ since });
    if (fetched.kind === 'error') {
      fetchFailed = true;
      break;
    }

    if (fetched.kind === 'not_modified') {
      if (page === 0) outcome = 'unchanged';
      break;
    }

    const data = fetched.data;
    if (data.full_resync_recommended) fullResyncRecommended = true;

    const applied = await applyMasterDataPage(data, now);
    if (applied) {
      outcome = 'changed';
      pagesApplied += 1;
    }

    const next = data.updated_at;
    if (typeof next === 'string' && next.length > 0) {
      await prefsRepository.set(prefsRepository.keys.lastMasterDataPull, next);
      since = next;
    }

    if (!data.has_more) break;
    if (!next) break;
  }

  if (fetchFailed && pagesApplied === 0 && outcome !== 'changed') {
    return { outcome: 'failed', fullResyncRecommended: fullResyncRecommended || undefined };
  }

  await prefsRepository.set(prefsRepository.keys.lastSyncTime, now);
  await mergeStockFromStaffInventory();
  await refreshTrialCountFromServer();

  try {
    await useCartStore.getState().rehydrateFromDb();
  } catch {
    // Cart refresh is best-effort after a catalog pull.
  }

  if (fullResyncRecommended) {
    showToast('Large catalog update', 'For a full sync, sign out and sign back in.');
  }

  if (fetchFailed) {
    return { outcome: 'failed', fullResyncRecommended: fullResyncRecommended || undefined };
  }

  return {
    outcome,
    fullResyncRecommended: fullResyncRecommended || undefined,
  };
}

export async function pullMasterData(): Promise<PullMasterDataResult> {
  if (!(await getStoredAccessToken())) {
    return { outcome: 'skipped' };
  }
  if (masterDataPullInFlight) return masterDataPullInFlight;
  masterDataPullInFlight = pullMasterDataImpl().finally(() => {
    masterDataPullInFlight = null;
  });
  return masterDataPullInFlight;
}

import {
  fetchInitialPull,
  fetchStaffCategories,
  fetchStaffInventory,
  fetchStaffPricing,
  fetchStaffTaxSettings,
  normalizeProductsFromInitialPull,
  normalizeProductsFromList,
} from '@/api/syncAdapter';
import { prefsRepository } from '@/db/prefsRepository';
import { productRepository } from '@/db/productRepository';
import { settingsRepository } from '@/db/settingsRepository';
import { trialRepository } from '@/db/trialRepository';
import { assertApiConfigured } from '@/lib/authErrors';
import { replaceCategories } from '@/lib/categoriesStore';
import { normalizeOrg } from '@/lib/normalizeOrg';
import { hashFingerprintCanonical, type DeviceFingerprint } from '@/services/deviceFingerprint';
import type { OrganizationDto } from '@/types/organization';

export type SyncStep = {
  id: string;
  label: string;
};

export const SYNC_STEPS: SyncStep[] = [
  { id: 'inventory', label: 'Downloading inventory…' },
  { id: 'pricing', label: 'Fetching prices…' },
  { id: 'tax', label: 'Loading tax settings…' },
  { id: 'categories', label: 'Syncing categories…' },
  { id: 'finalize', label: 'Preparing app…' },
];

async function withRetries<T>(fn: () => Promise<T>, max = 3): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= max; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i === max) throw e;
    }
  }
  throw last;
}

export type InitialSyncProgress = {
  stepIndex: number;
  stepLabel: string;
  progress: number;
};

export async function runInitialDataSync(
  fingerprint: DeviceFingerprint,
  onProgress: (p: InitialSyncProgress) => void,
): Promise<void> {
  assertApiConfigured();
  const fpHash = await hashFingerprintCanonical(fingerprint);
  const now = new Date().toISOString();

  const initial = await withRetries(() => fetchInitialPull()).catch(() => null);

  if (initial?.organization) {
    const org = normalizeOrg(initial.organization);
    if (org) {
      await settingsRepository.setJson(settingsRepository.keys.organization, org);
      await settingsRepository.setJson(settingsRepository.keys.taxSettings, {
        defaultTaxRate: org.defaultTaxRate ?? 0,
        taxEnabled: org.taxEnabled ?? false,
      });
    }
  }

  if (initial?.products && initial.products.length > 0) {
    const products = normalizeProductsFromInitialPull(initial);
    await productRepository.upsertMany(products);
    if (initial.categories?.length) {
      await replaceCategories(initial.categories);
    }
    onProgress({ stepIndex: 0, stepLabel: SYNC_STEPS[0].label, progress: 0.85 });
  } else {
    onProgress({ stepIndex: 0, stepLabel: SYNC_STEPS[0].label, progress: 0.05 });
    const inv = await withRetries(() => fetchStaffInventory());
    if (inv.length) {
      await productRepository.upsertMany(normalizeProductsFromList(inv, now));
    }
    onProgress({ stepIndex: 1, stepLabel: SYNC_STEPS[1].label, progress: 0.35 });
    const pricing = await withRetries(() => fetchStaffPricing());
    if (pricing.length) {
      await productRepository.upsertMany(normalizeProductsFromList(pricing, now));
    }
    onProgress({ stepIndex: 2, stepLabel: SYNC_STEPS[2].label, progress: 0.55 });
    const tax = await withRetries(() => fetchStaffTaxSettings());
    if (tax) {
      await settingsRepository.setJson(settingsRepository.keys.taxSettings, tax);
    }
    onProgress({ stepIndex: 3, stepLabel: SYNC_STEPS[3].label, progress: 0.7 });
    const cats = await withRetries(() => fetchStaffCategories());
    if (cats.length) {
      await replaceCategories(cats);
    }
  }

  const org = await settingsRepository.getJson<OrganizationDto>(settingsRepository.keys.organization);
  const limit = org?.salesLimit != null && org.salesLimit > 0 ? org.salesLimit : 50;
  await trialRepository.ensureRow(fpHash, limit);

  onProgress({ stepIndex: 4, stepLabel: SYNC_STEPS[4].label, progress: 0.95 });
  await settingsRepository.setInitialSyncDone(true);
  await prefsRepository.set(prefsRepository.keys.lastSyncTime, new Date().toISOString());
  onProgress({ stepIndex: 4, stepLabel: SYNC_STEPS[4].label, progress: 1 });
}

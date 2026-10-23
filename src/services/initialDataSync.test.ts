import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import { db } from '@/db/schema';
import { prefsRepository } from '@/db/prefsRepository';
import { settingsRepository } from '@/db/settingsRepository';
import * as env from '@/lib/env';
import { runInitialDataSync } from '@/services/initialDataSync';
import type { DeviceFingerprint } from '@/services/deviceFingerprint';

const fingerprint: DeviceFingerprint = {
  installationId: 'install-1',
  deviceId: 'install-1',
  model: 'Web',
  systemVersion: 'test',
  buildNumber: 'pwa',
  appVersion: '2.5.0',
};

describe('runInitialDataSync', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.spyOn(env, 'getApiBaseUrl').mockReturnValue('https://api.example');
    await db.delete();
    await db.open();
  });

  it('stores products, organization, tax, categories, and the sync flag', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url) => {
      expect(String(url)).toContain('/sync/initial-pull');
      return {
        data: {
          organization: {
            id: 'org-1',
            name: 'Shop',
            sales_limit: 40,
            sales_count: 9,
            default_tax_rate: 15,
            tax_enabled: true,
            business_location: ' Accra ',
          },
          products: [
            {
              id: 'p1',
              name: 'Rice',
              sellingPrice: 12.5,
              currentStock: 2.5,
              barcode: '111',
              costPrice: 4,
            },
          ],
          categories: [{ id: 'c1', name: 'Food' }, { name: 'skip' }],
          syncTimestamp: '2026-01-01T00:00:00.000Z',
        },
      } as never;
    });

    await runInitialDataSync(fingerprint, () => {});

    expect(await db.products.get('p1')).toMatchObject({
      name: 'Rice',
      price: 12.5,
      stock_quantity: 2.5,
      barcode: '111',
      cost_price: 4,
      synced_at: '2026-01-01T00:00:00.000Z',
    });
    expect(await settingsRepository.getJson(settingsRepository.keys.organization)).toMatchObject({
      id: 'org-1',
      name: 'Shop',
      salesLimit: 40,
      salesCount: 9,
      defaultTaxRate: 15,
      taxEnabled: true,
      businessLocation: 'Accra',
      currency: 'GHS',
    });
    expect(await settingsRepository.getJson(settingsRepository.keys.taxSettings)).toEqual({
      defaultTaxRate: 15,
      taxEnabled: true,
    });
    expect(await settingsRepository.getJson(settingsRepository.keys.categories)).toEqual([{ id: 'c1', name: 'Food' }]);
    expect(await settingsRepository.get(settingsRepository.keys.initialSyncDone)).toBe('1');
    expect(await db.trial_usage.get(1)).toMatchObject({ sales_count: 0, trial_limit: 40 });
    expect(await prefsRepository.get(prefsRepository.keys.lastSyncTime)).toEqual(expect.any(String));
  });

  it('falls back when the initial pull has no products and keeps an existing sales count', async () => {
    await db.trial_usage.put({
      id: 1,
      sales_count: 7,
      trial_limit: 50,
      device_fingerprint_hash: 'old',
      last_updated: '2020-01-01T00:00:00.000Z',
    });
    vi.spyOn(api, 'get').mockImplementation(async (url) => {
      const path = String(url);
      if (path.includes('/sync/initial-pull')) return { data: { products: [] } } as never;
      if (path.includes('/staff/inventory')) {
        return { data: [{ id: 'p2', name: 'Oil', price: 5, stock_quantity: 1 }] } as never;
      }
      if (path.includes('/staff/pricing')) return { data: [] } as never;
      if (path.includes('/staff/settings/tax')) {
        return { data: { defaultTaxRate: 5, taxEnabled: true } } as never;
      }
      if (path.includes('/staff/categories')) return { data: { categories: [{ id: 'c2', name: 'Oil' }] } } as never;
      throw new Error(`unexpected ${path}`);
    });

    await runInitialDataSync(fingerprint, () => {});

    expect(await db.products.get('p2')).toMatchObject({ name: 'Oil', price: 5, stock_quantity: 1 });
    expect(await settingsRepository.getJson(settingsRepository.keys.taxSettings)).toEqual({
      defaultTaxRate: 5,
      taxEnabled: true,
    });
    expect(await settingsRepository.getJson(settingsRepository.keys.categories)).toEqual([{ id: 'c2', name: 'Oil' }]);
    expect((await db.trial_usage.get(1))?.sales_count).toBe(7);
    expect(await settingsRepository.isInitialSyncDone()).toBe(true);
  });

  it('falls back to the split endpoints when the initial pull keeps failing', async () => {
    let pullTries = 0;
    vi.spyOn(api, 'get').mockImplementation(async (url) => {
      const path = String(url);
      if (path.includes('/sync/initial-pull')) {
        pullTries += 1;
        throw new Error('pull down');
      }
      if (path.includes('/staff/inventory')) {
        return { data: [{ id: 'p3', name: 'Soap', price: 2, stock_quantity: 4 }] } as never;
      }
      if (path.includes('/staff/pricing')) return { data: [] } as never;
      if (path.includes('/staff/settings/tax')) return { data: { defaultTaxRate: 0, taxEnabled: false } } as never;
      if (path.includes('/staff/categories')) return { data: [] } as never;
      throw new Error(`unexpected ${path}`);
    });

    await runInitialDataSync(fingerprint, () => {});

    expect(pullTries).toBe(3);
    expect(await db.products.get('p3')).toMatchObject({ name: 'Soap', price: 2, stock_quantity: 4 });
    expect(await settingsRepository.isInitialSyncDone()).toBe(true);
  });

  it('retries a failed step and leaves initial sync unset when it still fails', async () => {
    let inventoryTries = 0;
    vi.spyOn(api, 'get').mockImplementation(async (url) => {
      const path = String(url);
      if (path.includes('/sync/initial-pull')) return { data: { products: [] } } as never;
      if (path.includes('/staff/inventory')) {
        inventoryTries += 1;
        throw new Error('inventory down');
      }
      throw new Error(`unexpected ${path}`);
    });

    await expect(runInitialDataSync(fingerprint, () => {})).rejects.toThrow('inventory down');

    expect(inventoryTries).toBe(3);
    expect(await settingsRepository.get(settingsRepository.keys.initialSyncDone)).toBeNull();
  });
});

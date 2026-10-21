import { beforeEach, describe, expect, it } from 'vitest';
import { insertProduct } from '@/db/barcode';
import { prefsRepository } from '@/db/prefsRepository';
import { REQUIRED_TABLES, db, type Product } from '@/db/schema';
import { settingsRepository } from '@/db/settingsRepository';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    barcode: '123',
    sku: null,
    name: 'Item',
    price: 1,
    cost_price: null,
    stock_quantity: 0,
    category_id: null,
    is_temporary: 0,
    synced_at: null,
    updated_at: '2026-01-01T00:00:00.000Z',
    auto_convert_json: null,
    ...overrides,
  };
}

describe('nutapos_staff', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('opens the user_version 9 tables', () => {
    const names = Array.from(db.backendDB()?.objectStoreNames ?? []);
    for (const table of REQUIRED_TABLES) {
      expect(names).toContain(table);
    }
    expect(names).toContain('secrets');
  });

  it('round-trips settings strings and JSON', async () => {
    await settingsRepository.set(settingsRepository.keys.initialSyncDone, '0');
    expect(await settingsRepository.get('initial_sync_done')).toBe('0');
    expect(await settingsRepository.isInitialSyncDone()).toBe(false);

    await settingsRepository.setJson(settingsRepository.keys.taxSettings, { taxEnabled: true, taxRate: 12.5 });
    const stored = await settingsRepository.get('tax_settings');
    expect(typeof stored).toBe('string');
    expect(await settingsRepository.getJson('tax_settings')).toEqual({ taxEnabled: true, taxRate: 12.5 });
    expect(await settingsRepository.getJson('missing')).toBeNull();
    await settingsRepository.set('tax_settings', '{');
    expect(await settingsRepository.getJson('tax_settings')).toBeNull();
  });

  it('round-trips prefs as JSON values', async () => {
    await prefsRepository.set(prefsRepository.keys.installationId, 'install-1');
    await prefsRepository.set(prefsRepository.keys.defaultPrinter, { transport: 'browser', id: 'system' });
    expect(await prefsRepository.get('installation_id')).toBe('install-1');
    expect(await prefsRepository.get(prefsRepository.keys.defaultPrinter)).toEqual({
      transport: 'browser',
      id: 'system',
    });
    expect(await prefsRepository.get('missing')).toBeNull();
  });

  it('rejects a duplicate barcode and allows a null barcode', async () => {
    await insertProduct(product());
    await expect(insertProduct(product({ id: 'p2' }))).rejects.toThrow('Barcode already in use');
    await insertProduct(product({ id: 't1', barcode: null, is_temporary: 1 }));
    await insertProduct(product({ id: 't2', barcode: null, is_temporary: 1 }));
    expect(await db.products.count()).toBe(3);
  });
});

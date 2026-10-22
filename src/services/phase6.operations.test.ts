import { beforeEach, describe, expect, it } from 'vitest';
import { db, type Product, type Sale, type SaleItem, type SyncQueueRow } from '@/db/schema';
import { prefsRepository } from '@/db/prefsRepository';
import { setAccessToken, getAccessToken } from '@/db/secretsRepository';
import { batchOperationsService } from '@/services/batchOperationsService';
import { databaseBackupService } from '@/services/databaseBackupService';
import { databaseIntegrityService } from '@/services/databaseIntegrityService';
import { clockOffsetMinutes, isClockSkewed } from '@/services/timeValidationService';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    barcode: '123',
    sku: null,
    name: 'Apple',
    price: 2,
    cost_price: null,
    stock_quantity: 4,
    category_id: null,
    is_temporary: 0,
    synced_at: null,
    updated_at: '2026-06-01T00:00:00.000Z',
    auto_convert_json: null,
    ...overrides,
  };
}

function sale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: 's1',
    total_amount: 4,
    tax_amount: 0.4,
    discount_amount: 0,
    payment_method: 'CASH',
    sold_at: '2026-06-15T12:00:00.000Z',
    synced_at: '2026-06-15T13:00:00.000Z',
    staff_id: 'user-1',
    branch_id: null,
    is_return: 0,
    original_sale_id: null,
    receipt_number: 'RCP-1',
    ...overrides,
  };
}

function item(overrides: Partial<SaleItem> = {}): SaleItem {
  return {
    id: 'i1',
    sale_id: 's1',
    product_id: 'p1',
    quantity: 2,
    unit_price: 2,
    total_price: 4,
    is_temporary_product: 0,
    variance_reason: null,
    variance_note: null,
    ...overrides,
  };
}

function queue(entityId: string): SyncQueueRow {
  return {
    entity_type: 'sale',
    entity_id: entityId,
    operation: 'CREATE',
    payload: { keep: true },
    status: 'COMPLETED',
    attempt_count: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    last_attempt_at: null,
    last_error: null,
    failure_id: null,
    error_code: null,
    admin_message: null,
    last_failed_at: null,
    resolution_action: null,
    resolution_status: null,
    resolved_at: null,
    admin_applied_sale_id: null,
  };
}

describe('phase 6 local operations', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('deletes only synced sales older than 90 days', async () => {
    const now = new Date('2026-06-15T00:00:00.000Z');
    await db.products.add(product());
    await db.sales.bulkAdd([
      sale({ id: 'old-synced', synced_at: '2020-01-01T00:00:00.000Z', sold_at: '2020-01-01T00:00:00.000Z' }),
      sale({ id: 'old-unsynced', synced_at: null, sold_at: '2020-01-01T00:00:00.000Z' }),
      sale({ id: 'recent-synced', synced_at: '2026-06-01T00:00:00.000Z' }),
    ]);
    await db.sale_items.bulkAdd([
      item({ id: 'old-item', sale_id: 'old-synced' }),
      item({ id: 'kept-item', sale_id: 'recent-synced' }),
    ]);
    await db.sync_queue.bulkAdd([queue('old-synced'), queue('recent-synced')]);

    const removed = await batchOperationsService.clearOldSales(now);

    expect(removed).toBe(1);
    expect(await db.sales.get('old-synced')).toBeUndefined();
    expect(await db.sales.get('old-unsynced')).toBeTruthy();
    expect(await db.sales.get('recent-synced')).toBeTruthy();
    expect(await db.sale_items.get('old-item')).toBeUndefined();
    expect(await db.sale_items.get('kept-item')).toBeTruthy();
    const queued = await db.sync_queue.toArray();
    expect(queued.map((row) => row.entity_id)).toEqual(['recent-synced']);
  });

  it('exports synced and unsynced sale lines and skips returns', async () => {
    await db.products.add(product());
    await db.sales.bulkAdd([
      sale({ id: 'synced', receipt_number: 'RCP-SYNC', synced_at: '2026-06-15T13:00:00.000Z' }),
      sale({
        id: 'unsynced',
        receipt_number: 'RCP-LOCAL',
        synced_at: null,
        sold_at: '2026-06-16T08:00:00.000Z',
        payment_method: 'CARD',
      }),
      sale({ id: 'empty', receipt_number: 'RCP-EMPTY', sold_at: '2026-06-17T08:00:00.000Z' }),
      sale({ id: 'ret', is_return: 1, receipt_number: 'RCP-RET', original_sale_id: 'synced' }),
    ]);
    await db.sale_items.bulkAdd([
      item({ id: 'a', sale_id: 'synced', quantity: 1.5 }),
      item({ id: 'b', sale_id: 'unsynced', quantity: 2, product_id: 'missing' }),
      item({ id: 'c', sale_id: 'ret' }),
    ]);

    const csv = await batchOperationsService.exportSalesCSV({ start: '2026-06-01', end: '2026-06-30' });
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Receipt,Sold at,Product,Qty,Unit price,Sale total,Sale tax,Payment,Synced');
    expect(csv).toContain('RCP-SYNC,2026-06-15T12:00:00.000Z,Apple,1.5,2,4,0.4,CASH,yes');
    expect(csv).toContain('RCP-LOCAL,2026-06-16T08:00:00.000Z,,2,2,4,0.4,CARD,no');
    expect(csv).toContain('RCP-EMPTY,2026-06-17T08:00:00.000Z,,0,,4,0.4,CASH,yes');
    expect(csv).not.toContain('RCP-RET');
  });

  it('keeps tokens out of a backup and restores products and sales', async () => {
    await setAccessToken('super-secret-access');
    await prefsRepository.set('access_token', 'super-secret-access');
    await db.products.add(product({ name: 'Original' }));
    await db.sales.add(sale());
    const fileName = await databaseBackupService.createBackup({ download: false });
    const stored = await db.local_backups.get(fileName);
    const json = JSON.stringify(stored?.payload);
    expect(json).not.toContain('super-secret-access');
    expect(json).not.toContain('access_token');
    expect(json).toContain('Original');

    await db.products.update('p1', { name: 'Changed' });
    await db.sales.clear();
    await databaseBackupService.restoreFromBackup(fileName);

    expect((await db.products.get('p1'))?.name).toBe('Original');
    expect(await db.sales.get('s1')).toBeTruthy();
    expect(await getAccessToken()).toBe('super-secret-access');
    expect(await prefsRepository.get('access_token')).toBeNull();
  });

  it('strips token keys when restoring a file', async () => {
    await setAccessToken('keep-me');
    const dirty = {
      access_token: 'file-token',
      tables: {
        products: [product({ name: 'From file' })],
        sales: [],
        prefs: [{ key: 'access_token', value: 'file-token' }, { key: 'installation_id', value: 'install-9' }],
        secrets: [{ key: 'access_token', value: 'file-token' }],
      },
    };
    await databaseBackupService.restoreFromFileContents(JSON.stringify(dirty));
    expect((await db.products.get('p1'))?.name).toBe('From file');
    expect(await getAccessToken()).toBe('keep-me');
    expect(await prefsRepository.get('access_token')).toBeNull();
    expect(await prefsRepository.get('installation_id')).toBe('install-9');
  });

  it('auto-fixes a trial count that differs by more than 5', async () => {
    await db.trial_usage.put({
      id: 1,
      sales_count: 0,
      trial_limit: 50,
      device_fingerprint_hash: 'pending_initial_sync',
      last_updated: '2026-01-01T00:00:00.000Z',
    });
    await db.sales.bulkAdd(
      Array.from({ length: 6 }, (_, index) => sale({ id: `sale-${index}`, receipt_number: `R-${index}` })),
    );
    const report = await databaseIntegrityService.checkFull();
    expect(report.healthy).toBe(false);
    expect(report.errors).toContain('Trial count mismatch (auto-fixed: set to 6)');
    expect((await db.trial_usage.get(1))?.sales_count).toBe(6);
  });

  it('leaves a trial count alone when the gap is 5 or less', async () => {
    await db.trial_usage.put({
      id: 1,
      sales_count: 0,
      trial_limit: 50,
      device_fingerprint_hash: 'pending_initial_sync',
      last_updated: '2026-01-01T00:00:00.000Z',
    });
    await db.sales.bulkAdd(
      Array.from({ length: 5 }, (_, index) => sale({ id: `near-${index}`, receipt_number: `N-${index}` })),
    );
    const report = await databaseIntegrityService.checkFull();
    expect(report.healthy).toBe(true);
    expect((await db.trial_usage.get(1))?.sales_count).toBe(0);
  });

  it('reports orphaned sale items', async () => {
    await db.sale_items.add(item({ sale_id: 'missing-sale' }));
    const report = await databaseIntegrityService.checkFull();
    expect(report.errors).toContain('1 orphaned sale item(s) found');
    expect(report.pragmaCorrupt).toBe(false);
  });

  it('warns only when the clock is more than 5 minutes off', () => {
    const server = '2026-01-01T00:00:00.000Z';
    const serverMs = Date.parse(server);
    expect(isClockSkewed(clockOffsetMinutes(serverMs + 5 * 60_000, server))).toBe(false);
    expect(isClockSkewed(clockOffsetMinutes(serverMs - 5 * 60_000, server))).toBe(false);
    expect(isClockSkewed(clockOffsetMinutes(serverMs + 6 * 60_000, server))).toBe(true);
    expect(isClockSkewed(clockOffsetMinutes(serverMs - 6 * 60_000, server))).toBe(true);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { db, type Product, type Sale } from '@/db/schema';
import { prefsRepository } from '@/db/prefsRepository';
import { getAccessToken, getRefreshToken, setAccessToken, setRefreshToken } from '@/db/secretsRepository';
import { settingsRepository } from '@/db/settingsRepository';
import { logoutSession } from '@/context/AuthContext';
import { isDeviceBindingCompleted } from '@/services/deviceBindingService';
import { saveUserProfile } from '@/services/userProfileStore';

const product: Product = {
  id: 'p1',
  barcode: '123',
  sku: null,
  name: 'Item',
  price: 1,
  cost_price: null,
  stock_quantity: 3,
  category_id: null,
  is_temporary: 0,
  synced_at: null,
  updated_at: '2026-01-01T00:00:00.000Z',
  auto_convert_json: null,
};

const sale: Sale = {
  id: 's1',
  total_amount: 1,
  tax_amount: 0,
  discount_amount: 0,
  payment_method: 'CASH',
  sold_at: '2026-01-01T00:00:00.000Z',
  synced_at: null,
  staff_id: 'user-1',
  branch_id: null,
  is_return: 0,
  original_sale_id: null,
  receipt_number: 'RCP-1',
};

describe('logoutSession', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('clears the session and keeps products, sales, and the installation id', async () => {
    await db.products.add(product);
    await db.sales.add(sale);
    await db.sync_queue.add({
      entity_type: 'sale',
      entity_id: 's1',
      operation: 'CREATE',
      payload: { keep: true },
      status: 'PENDING',
      attempt_count: 0,
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
    });
    await setAccessToken('access');
    await setRefreshToken('refresh');
    await saveUserProfile({
      userId: 'user-1',
      staffId: 'STAFF',
      branchId: 'branch-1',
      organizationId: 'org-1',
      needsPasswordChange: false,
    });
    await prefsRepository.set(prefsRepository.keys.installationId, 'install-1');
    await prefsRepository.set(prefsRepository.keys.deviceBindingCompleted, true);
    await settingsRepository.setInitialSyncDone(true);
    await settingsRepository.setJson(settingsRepository.keys.organization, { id: 'org-1', name: 'Shop' });

    await logoutSession();

    expect(await db.products.get('p1')).toMatchObject({ name: 'Item', stock_quantity: 3 });
    expect(await db.sales.get('s1')).toMatchObject({ receipt_number: 'RCP-1' });
    expect(await db.sync_queue.count()).toBe(1);
    expect(await getAccessToken()).toBeNull();
    expect(await getRefreshToken()).toBeNull();
    expect(await settingsRepository.get(settingsRepository.keys.initialSyncDone)).toBe('0');
    expect(await isDeviceBindingCompleted()).toBe(false);
    expect(await prefsRepository.get(prefsRepository.keys.installationId)).toBe('install-1');
    expect(await settingsRepository.getJson(settingsRepository.keys.organization)).toEqual({
      id: 'org-1',
      name: 'Shop',
    });
  });
});

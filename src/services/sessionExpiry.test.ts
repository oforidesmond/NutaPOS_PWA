import { beforeEach, describe, expect, it } from 'vitest';
import { db, type Product, type Sale } from '@/db/schema';
import { prefsRepository } from '@/db/prefsRepository';
import { getAccessToken, getRefreshToken, setAccessToken, setRefreshToken } from '@/db/secretsRepository';
import { settingsRepository } from '@/db/settingsRepository';
import { expireDeadSession } from '@/services/sessionExpiry';
import { isDeviceBindingCompleted } from '@/services/deviceBindingService';
import { loadUserProfile, saveUserProfile } from '@/services/userProfileStore';

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

describe('expireDeadSession', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('clears auth secrets but keeps POS data and setup flags', async () => {
    await setAccessToken('access');
    await setRefreshToken('refresh');
    await saveUserProfile({
      userId: 'user-1',
      staffId: 'STF-1',
      branchId: null,
      organizationId: 'org-1',
      needsPasswordChange: false,
    });
    await prefsRepository.set(prefsRepository.keys.deviceBindingCompleted, true);
    await settingsRepository.setInitialSyncDone(true);
    await db.products.add(product);
    await db.sales.add(sale);
    await db.sync_queue.add({
      entity_type: 'sale',
      entity_id: 's1',
      payload: { body: { id: 's1' } },
      status: 'PENDING',
      attempt_count: 0,
      last_attempt_at: null,
      last_error: null,
      created_at: '2026-01-01T00:00:00.000Z',
      failure_id: null,
      error_code: null,
      admin_message: null,
      last_failed_at: null,
    });

    await expireDeadSession();

    expect(await getAccessToken()).toBeNull();
    expect(await getRefreshToken()).toBeNull();
    expect(await loadUserProfile()).toBeNull();
    expect(await isDeviceBindingCompleted()).toBe(true);
    expect(await settingsRepository.isInitialSyncDone()).toBe(true);
    expect(await db.products.get('p1')).toBeTruthy();
    expect(await db.sales.get('s1')).toBeTruthy();
    expect(await db.sync_queue.count()).toBe(1);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMasterDataWithResult } from '@/api/masterDataApi';
import { fetchStaffInventory } from '@/api/syncAdapter';
import { setAccessToken } from '@/db/secretsRepository';
import { db, type Product } from '@/db/schema';
import { pullMasterData } from '@/services/masterDataPull';

vi.mock('@/api/masterDataApi', () => ({
  fetchMasterDataWithResult: vi.fn(),
}));

vi.mock('@/api/trialApi', () => ({
  fetchTrialStatus: vi.fn(async () => ({ sales_count: 1 })),
}));

vi.mock('@/api/syncAdapter', async () => {
  const actual = await vi.importActual<typeof import('@/api/syncAdapter')>('@/api/syncAdapter');
  return { ...actual, fetchStaffInventory: vi.fn(async () => []) };
});

const fetchMaster = fetchMasterDataWithResult as unknown as ReturnType<typeof vi.fn>;
const fetchInventory = fetchStaffInventory as unknown as ReturnType<typeof vi.fn>;

function product(): Product {
  return {
    id: 'p1',
    barcode: '111',
    sku: 'SKU',
    name: 'Soap',
    price: 5,
    cost_price: 1,
    stock_quantity: 3,
    category_id: null,
    is_temporary: 0,
    synced_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    auto_convert_json: '{"keep":true}',
  };
}

describe('pullMasterData', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await setAccessToken('token');
    fetchMaster.mockReset();
    fetchInventory.mockReset();
    fetchInventory.mockResolvedValue([]);
    await db.products.add(product());
    await db.sales.add({
      id: 'sale-1',
      total_amount: 5,
      tax_amount: 0,
      discount_amount: 0,
      payment_method: 'CASH',
      sold_at: '2026-01-02T00:00:00.000Z',
      synced_at: null,
      staff_id: 'staff-1',
      branch_id: null,
      is_return: 0,
      original_sale_id: null,
      receipt_number: 'RCP-1',
    });
    await db.sync_queue.add({
      entity_type: 'sale',
      entity_id: 'sale-1',
      operation: 'CREATE',
      payload: { body: { id: 'sale-1' } },
      status: 'PENDING',
      attempt_count: 0,
      created_at: '2026-01-02T00:00:00.000Z',
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
  });

  it('updates a changed price and leaves the unsynced sale in place', async () => {
    fetchMaster.mockResolvedValueOnce({
      kind: 'ok',
      data: {
        products: [{ id: 'p1', name: 'Soap', price: 9, barcode: '111', sku: 'SKU' }],
        has_more: false,
        updated_at: '2026-03-01T00:00:00.000Z',
      },
    });

    const result = await pullMasterData();
    expect(result.outcome).toBe('changed');
    const saved = await db.products.get('p1');
    expect(saved?.price).toBe(9);
    expect(saved?.stock_quantity).toBe(3);
    expect(saved?.auto_convert_json).toBe('{"keep":true}');
    expect((await db.sales.get('sale-1'))?.synced_at).toBeNull();
    expect((await db.sync_queue.toArray())[0]?.status).toBe('PENDING');
    expect(await db.sales.count()).toBe(1);
  });
});

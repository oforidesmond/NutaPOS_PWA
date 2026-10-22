import { beforeEach, describe, expect, it, vi } from 'vitest';
import { postStaffSale } from '@/api/salesApi';
import { postTemporaryItem } from '@/api/temporaryItemsApi';
import { setAccessToken } from '@/db/secretsRepository';
import { db, type Product, type SyncQueueRow } from '@/db/schema';
import { syncWorker } from '@/services/syncWorker';

vi.mock('@/api/salesApi', async () => {
  const actual = await vi.importActual<typeof import('@/api/salesApi')>('@/api/salesApi');
  return { ...actual, postStaffSale: vi.fn() };
});

vi.mock('@/api/temporaryItemsApi', () => ({
  postTemporaryItem: vi.fn(),
}));

vi.mock('@/api/syncFailuresApi', () => ({
  fetchSyncFailureResolutions: vi.fn(async () => ({ data: [], updatedAt: '2026-01-01T00:00:00.000Z' })),
}));

const postSale = postStaffSale as unknown as ReturnType<typeof vi.fn>;
const postTemp = postTemporaryItem as unknown as ReturnType<typeof vi.fn>;

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'temp-1',
    barcode: null,
    sku: null,
    name: 'Temp',
    price: 4,
    cost_price: null,
    stock_quantity: 0,
    category_id: null,
    is_temporary: 1,
    synced_at: null,
    updated_at: '2026-01-01T00:00:00.000Z',
    auto_convert_json: null,
    ...overrides,
  };
}

function saleBody(id = 'sale-1') {
  return {
    id,
    receiptNumber: 'RCP-1',
    receipt_number: 'RCP-1',
    organizationId: 'org-1',
    createdById: 'staff-1',
    subtotal: 4,
    taxRate: 0,
    taxAmount: 0,
    discountAmount: 0,
    totalAmount: 4,
    paymentMethod: 'CASH',
    currency: 'GHS',
    soldAt: '2026-01-01T00:00:00.000Z',
    deviceInfo: { deviceUuid: 'install-1' },
    items: [
      {
        id: 'line-1',
        productId: 'temp-1',
        productName: 'Temp',
        quantity: 1,
        unitPrice: 4,
        unitCost: 0,
        taxRate: 0,
        taxAmount: 0,
        lineTotal: 4,
      },
    ],
  };
}

function queue(overrides: Partial<SyncQueueRow> = {}): SyncQueueRow {
  return {
    entity_type: 'sale',
    entity_id: 'sale-1',
    operation: 'CREATE',
    payload: { idempotencyKey: 'sale-1', body: saleBody() },
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
    ...overrides,
  };
}

describe('syncWorker', () => {
  beforeEach(async () => {
    vi.stubGlobal('navigator', { onLine: true });
    await db.delete();
    await db.open();
    await setAccessToken('token');
    postSale.mockReset();
    postTemp.mockReset();
    await db.sales.add({
      id: 'sale-1',
      total_amount: 4,
      tax_amount: 0,
      discount_amount: 0,
      payment_method: 'CASH',
      sold_at: '2026-01-01T00:00:00.000Z',
      synced_at: null,
      staff_id: 'staff-1',
      branch_id: null,
      is_return: 0,
      original_sale_id: null,
      receipt_number: 'RCP-1',
    });
    await db.trial_usage.add({
      id: 1,
      sales_count: 1,
      trial_limit: 50,
      device_fingerprint_hash: 'hash',
      last_updated: '2026-01-01T00:00:00.000Z',
    });
  });

  it('leaves an offline sale PENDING and uploads it when online', async () => {
    await db.sync_queue.add(queue());
    vi.stubGlobal('navigator', { onLine: false });
    await syncWorker.processQueue();
    expect(postSale).not.toHaveBeenCalled();
    expect((await db.sync_queue.toArray())[0]?.status).toBe('PENDING');

    vi.stubGlobal('navigator', { onLine: true });
    postSale.mockResolvedValueOnce({ kind: 'success', syncedAt: '2026-02-01T00:00:00.000Z' });
    await syncWorker.processQueue();
    expect((await db.sales.get('sale-1'))?.synced_at).toBe('2026-02-01T00:00:00.000Z');
    expect((await db.sync_queue.toArray())[0]?.status).toBe('COMPLETED');
  });

  it('posts a temporary item before the sale, and does not fail the sale when the item post fails', async () => {
    await db.products.add(product());
    const createdAt = '2026-01-01T00:00:00.000Z';
    await db.sync_queue.add(
      queue({
        entity_type: 'temporary_item',
        entity_id: 'sale-1_temp-1',
        payload: { body: { local_product_id: 'temp-1', name: 'Temp', price: 4, sold_at: createdAt, staff_id: 'staff-1', branch_id: null, local_sale_id: 'sale-1' } },
        created_at: createdAt,
      }),
    );
    await db.sync_queue.add(queue({ created_at: createdAt }));

    postTemp.mockRejectedValueOnce(new Error('temp down'));
    await syncWorker.processQueue();

    const rows = await db.sync_queue.orderBy('id').toArray();
    expect(rows[0]?.status).toBe('FAILED');
    expect(rows[0]?.attempt_count).toBe(1);
    expect(rows[1]?.status).toBe('PENDING');
    expect(rows[1]?.attempt_count).toBe(0);
    expect(postSale).not.toHaveBeenCalled();
    expect((await db.products.get('temp-1'))?.synced_at).toBeNull();

    const order: string[] = [];
    postTemp.mockImplementation(async () => {
      order.push('temp');
      return {};
    });
    postSale.mockImplementation(async () => {
      order.push('sale');
      return { kind: 'success', syncedAt: '2026-02-02T00:00:00.000Z' };
    });
    await syncWorker.processQueue();
    expect(order).toEqual(['temp', 'sale']);
    expect((await db.sales.get('sale-1'))?.synced_at).toBe('2026-02-02T00:00:00.000Z');
  });

  it('does not create another sale or increment sales_count on a duplicate 409', async () => {
    await db.sync_queue.add(queue());
    postSale.mockResolvedValueOnce({ kind: 'duplicate-success', syncedAt: '2026-02-03T00:00:00.000Z' });
    await syncWorker.processQueue();
    expect(await db.sales.count()).toBe(1);
    expect((await db.trial_usage.get(1))?.sales_count).toBe(1);
    expect((await db.sales.get('sale-1'))?.synced_at).toBe('2026-02-03T00:00:00.000Z');
  });

  it('moves a DLQ response to PENDING_SUPER_ADMIN and stops auto-retry', async () => {
    await db.sync_queue.add(queue());
    postSale.mockResolvedValue({
      kind: 'dlq-failure',
      status: 400,
      failure: { errorCode: 'DISCOUNT_EXCEEDS_LIMIT', failureId: 'fail-1', message: 'Sent to Admin' },
    });
    await syncWorker.processQueue();
    const first = (await db.sync_queue.toArray())[0];
    expect(first?.status).toBe('PENDING_SUPER_ADMIN');
    expect(first?.failure_id).toBe('fail-1');
    expect(first?.error_code).toBe('DISCOUNT_EXCEEDS_LIMIT');
    expect(first?.admin_message).toBe('Sent to Admin');
    await syncWorker.processQueue();
    expect(postSale).toHaveBeenCalledTimes(1);
  });

  it('marks an unknown entity type COMPLETED', async () => {
    await db.sync_queue.add(queue({ entity_type: 'inventory_event', entity_id: 'evt-1' }));
    await syncWorker.processQueue();
    expect((await db.sync_queue.toArray())[0]?.status).toBe('COMPLETED');
    expect(postSale).not.toHaveBeenCalled();
  });
});

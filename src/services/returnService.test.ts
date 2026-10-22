import { beforeEach, describe, expect, it, vi } from 'vitest';
import { postStaffReturnWithTimeout } from '@/api/returnsApi';
import { db, type Product } from '@/db/schema';
import { returnService } from '@/services/returnService';

vi.mock('@/api/returnsApi', () => ({
  postStaffReturnWithTimeout: vi.fn(),
  ReturnTimeoutError: class ReturnTimeoutError extends Error {
    constructor() {
      super('RETURN_TIMEOUT');
      this.name = 'ReturnTimeoutError';
    }
  },
}));

const postReturn = postStaffReturnWithTimeout as unknown as ReturnType<typeof vi.fn>;

function product(): Product {
  return {
    id: 'p1',
    barcode: '111',
    sku: null,
    name: 'Soap',
    price: 2.5,
    cost_price: 1,
    stock_quantity: 5,
    category_id: null,
    is_temporary: 0,
    synced_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    auto_convert_json: null,
  };
}

describe('returnService', () => {
  beforeEach(async () => {
    vi.stubGlobal('navigator', { onLine: true });
    await db.delete();
    await db.open();
    postReturn.mockReset();
    await db.products.add(product());
    await db.sales.add({
      id: 'sale-1',
      total_amount: 2.5,
      tax_amount: 0,
      discount_amount: 0,
      payment_method: 'CASH',
      sold_at: '2026-01-01T00:00:00.000Z',
      synced_at: '2026-01-01T00:00:00.000Z',
      staff_id: 'staff-1',
      branch_id: 'branch-1',
      is_return: 0,
      original_sale_id: null,
      receipt_number: 'RCP-ORIG',
    });
    await db.sale_items.add({
      id: 'line-1',
      sale_id: 'sale-1',
      product_id: 'p1',
      quantity: 1,
      unit_price: 2.5,
      total_price: 2.5,
      is_temporary_product: 0,
      variance_reason: null,
      variance_note: null,
    });
  });

  it('writes nothing while offline', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    await expect(
      returnService.processReturn({
        originalSaleId: 'sale-1',
        staffUserId: 'staff-1',
        branchId: 'branch-1',
        lines: [{ productId: 'p1', quantity: 1, unitPrice: 2.5, isTemporaryProduct: false }],
      }),
    ).rejects.toThrow('INTERNET_REQUIRED');
    expect(await db.sales.count()).toBe(1);
    expect(postReturn).not.toHaveBeenCalled();
    expect((await db.products.get('p1'))?.stock_quantity).toBe(5);
  });

  it('posts the original receipt, then stores RETURN and increases stock', async () => {
    postReturn.mockResolvedValueOnce({ syncedAt: '2026-02-01T00:00:00.000Z' });
    await returnService.processReturn({
      originalSaleId: 'sale-1',
      staffUserId: 'staff-1',
      branchId: 'branch-1',
      lines: [{ productId: 'p1', quantity: 1, unitPrice: 2.5, isTemporaryProduct: false }],
    });

    expect(postReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        original_sale_id: 'sale-1',
        receipt_number: 'RCP-ORIG',
        refund_method: 'cash',
        branch_id: 'branch-1',
        refund_amount: 2.5,
      }),
    );
    const stored = (await db.sales.toArray()).find((sale) => sale.is_return === 1);
    expect(stored?.payment_method).toBe('RETURN');
    expect(stored?.original_sale_id).toBe('sale-1');
    expect(stored?.synced_at).toBe('2026-02-01T00:00:00.000Z');
    expect(stored?.receipt_number?.startsWith('RET-')).toBe(true);
    expect(stored?.receipt_number).not.toBe('RCP-ORIG');
    expect((await db.products.get('p1'))?.stock_quantity).toBe(6);
    expect(await db.sync_queue.count()).toBe(0);
  });
});

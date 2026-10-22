import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StaffSalePayload } from '@/api/salesApi';
import { db, type Product } from '@/db/schema';
import { settingsRepository } from '@/db/settingsRepository';
import { previewTotals } from '@/lib/checkoutTotals';
import { saleService } from '@/services/saleService';
import { trialRepository } from '@/db/trialRepository';
import type { CartLine } from '@/stores/cartStore';
import { varianceDraftMessage } from '@/types/stockVariance';

function product(overrides: Partial<Product> & Pick<Product, 'id' | 'name'>): Product {
  return {
    barcode: null,
    sku: null,
    price: 10,
    cost_price: 1,
    stock_quantity: 5,
    category_id: null,
    is_temporary: 0,
    synced_at: null,
    updated_at: '2026-01-01T00:00:00.000Z',
    auto_convert_json: null,
    ...overrides,
  };
}

function line(item: Product, quantity = 1): CartLine {
  return { key: item.id, product: item, quantity };
}

async function seedOrg(planType = 'TRIAL'): Promise<void> {
  await settingsRepository.setJson(settingsRepository.keys.organization, {
    id: 'org-1',
    currency: 'GHS',
    planType,
  });
  await settingsRepository.setJson(settingsRepository.keys.taxSettings, {
    defaultTaxRate: 0,
    taxEnabled: false,
    discountEnabled: true,
    maxDiscountPercent: 10,
  });
  await trialRepository.ensureRow('hash', 50);
}

describe('completeSale offline commit', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await seedOrg();
  });

  it('rejects a discount above the cached percent and a negative total', async () => {
    const item = product({ id: 'p1', name: 'Item', price: 100, stock_quantity: 5 });
    await db.products.put(item);
    await expect(
      saleService.completeSale({
        lines: [line(item)],
        paymentMethod: 'CASH',
        staffUserId: 'user-1',
        branchId: null,
        discountAmount: 20,
      }),
    ).rejects.toThrow('Maximum discount is 10%. Contact your administrator to request a higher limit.');

    await settingsRepository.setJson(settingsRepository.keys.taxSettings, {
      defaultTaxRate: 0,
      taxEnabled: false,
      discountEnabled: true,
      maxDiscountPercent: 200,
    });
    await expect(
      saleService.completeSale({
        lines: [line({ ...item, price: 10 })],
        paymentMethod: 'CASH',
        staffUserId: 'user-1',
        branchId: null,
        discountAmount: 20,
      }),
    ).rejects.toThrow('Discount exceeds sale total');
    expect(await db.sales.count()).toBe(0);
  });

  it('allows a zero discount and blocks checkout at the trial limit', async () => {
    const item = product({ id: 'p1', name: 'Item', price: 10 });
    await db.products.put(item);
    await db.trial_usage.update(1, { sales_count: 50 });
    await expect(
      saleService.completeSale({
        lines: [line(item)],
        paymentMethod: 'CASH',
        staffUserId: 'user-1',
        branchId: null,
        discountAmount: 0,
      }),
    ).rejects.toThrow('TRIAL_LIMIT');
    expect(await db.sales.count()).toBe(0);
    expect((await db.trial_usage.get(1))?.sales_count).toBe(50);

    await db.trial_usage.update(1, { sales_count: 0 });
    const result = await saleService.completeSale({
      lines: [line(item)],
      paymentMethod: 'CASH',
      staffUserId: 'user-1',
      branchId: null,
      discountAmount: 0,
    });
    expect((await db.sales.get(result.saleId))?.discount_amount).toBe(0);
    expect((await db.trial_usage.get(1))?.sales_count).toBe(1);
  });

  it('commits an offline sale without fetch, drops stock, and queues the temporary item first', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const catalog = product({ id: 'cat', name: 'Rice', price: 10, stock_quantity: 1, barcode: '111' });
    const temporary = product({
      id: 'tmp',
      name: 'One off',
      price: 4,
      stock_quantity: 0,
      barcode: '999',
      is_temporary: 1,
    });
    const blankBarcode = product({
      id: 'blank',
      name: 'No code',
      price: 2,
      stock_quantity: 0,
      barcode: '   ',
      is_temporary: 1,
    });
    await db.products.bulkPut([catalog, temporary, blankBarcode]);

    const { saleId } = await saleService.completeSale({
      lines: [line(temporary), line(blankBarcode), line(catalog, 2)],
      paymentMethod: 'MOBILE_MONEY',
      staffUserId: 'user-1',
      branchId: 'branch-1',
      stockVarianceByLineKey: {
        cat: { varianceReason: 'OTHER', varianceNote: '  counted on shelf  ' },
      },
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    const sale = await db.sales.get(saleId);
    expect(sale?.synced_at).toBeNull();
    expect(sale?.staff_id).toBe('user-1');
    expect(sale?.branch_id).toBe('branch-1');
    expect(sale?.is_return).toBe(0);
    expect((await db.products.get('cat'))?.stock_quantity).toBe(-1);
    expect((await db.products.get('tmp'))?.stock_quantity).toBe(0);
    expect((await db.products.get('blank'))?.stock_quantity).toBe(0);

    const queue = await db.sync_queue.orderBy('id').toArray();
    expect(queue.map((row) => row.entity_type)).toEqual(['temporary_item', 'temporary_item', 'sale']);
    expect(queue.every((row) => row.status === 'PENDING' && row.attempt_count === 0)).toBe(true);
    expect(queue[0].id ?? 0).toBeLessThan(queue[1].id ?? 0);
    expect(queue[1].id ?? 0).toBeLessThan(queue[2].id ?? 0);

    const firstBody = (queue[0].payload as { body: Record<string, unknown> }).body;
    expect(firstBody.barcode).toBe('999');
    expect(firstBody.staff_id).toBe('user-1');
    expect(firstBody.branch_id).toBe('branch-1');
    expect(firstBody.local_sale_id).toBe(saleId);

    const blankBody = (queue[1].payload as { body: Record<string, unknown> }).body;
    expect(blankBody).not.toHaveProperty('barcode');

    const salePayload = queue[2].payload as { idempotencyKey: string; body: StaffSalePayload };
    expect(salePayload.idempotencyKey).toBe(saleId);
    expect(salePayload.body.syncedAt).toEqual(expect.any(String));
    expect(salePayload.body.createdById).toBe('user-1');
    expect(salePayload.body.deviceInfo?.deviceUuid).toEqual(expect.any(String));
    expect(salePayload.body.currency).toBe('GHS');
    const tempItem = salePayload.body.items.find((item) => item.productId === 'tmp');
    const shortItem = salePayload.body.items.find((item) => item.productId === 'cat');
    expect(tempItem?.varianceReason).toBe('PHYSICAL_STOCK_PRESENT');
    expect(tempItem?.varianceNote).toBeUndefined();
    expect(shortItem?.varianceReason).toBe('OTHER');
    expect(shortItem?.varianceNote).toBe('counted on shelf');
    expect(JSON.stringify(salePayload.body)).not.toContain('Other (explain below)');
    expect((await db.trial_usage.get(1))?.sales_count).toBe(1);
  });

  it('stores pre-tax line totals and does not increment a paid plan', async () => {
    await seedOrg('PAID');
    await settingsRepository.setJson(settingsRepository.keys.organization, {
      id: 'org-1',
      currency: 'USD',
      planType: 'PAID',
    });
    await settingsRepository.setJson(settingsRepository.keys.taxSettings, {
      defaultTaxRate: 10,
      taxEnabled: true,
      discountEnabled: false,
    });
    const item = product({ id: 'p1', name: 'Item', price: 50, stock_quantity: 4 });
    await db.products.put(item);
    const totals = await previewTotals([line(item)]);
    expect(totals).toMatchObject({ subtotal: 50, taxAmount: 5, totalAmount: 55 });

    await settingsRepository.setJson(settingsRepository.keys.taxSettings, {
      tax_rate: 10,
      tax_enabled: true,
      discount_enabled: true,
      max_discount_percent: 15,
    });
    expect(await previewTotals([line(item, 2)])).toMatchObject({ subtotal: 100, taxAmount: 10, totalAmount: 110 });

    await settingsRepository.setJson(settingsRepository.keys.taxSettings, {
      defaultTaxRate: 10,
      taxEnabled: true,
      discountEnabled: false,
    });
    const { saleId } = await saleService.completeSale({
      lines: [line(item)],
      paymentMethod: 'CARD',
      staffUserId: 'user-1',
      branchId: null,
    });
    const saved = await db.sale_items.where('sale_id').equals(saleId).first();
    expect(saved?.total_price).toBe(50);
    const queue = await db.sync_queue.orderBy('id').toArray();
    const body = (queue[0].payload as { body: StaffSalePayload }).body;
    expect(body.items[0].lineTotal).toBe(55);
    expect(body.items[0].unitCost).toBe(1);
    expect(body.currency).toBe('USD');
    expect(body.items[0].varianceReason).toBeUndefined();
    expect((await db.products.get('p1'))?.stock_quantity).toBe(3);
    expect((await db.trial_usage.get(1))?.sales_count).toBe(0);
  });

  it('throws when organization id is missing', async () => {
    await db.settings.delete(settingsRepository.keys.organization);
    const item = product({ id: 'p1', name: 'Item' });
    await db.products.put(item);
    await expect(
      saleService.completeSale({
        lines: [line(item)],
        paymentMethod: 'CASH',
        staffUserId: 'user-1',
        branchId: null,
      }),
    ).rejects.toThrow('Missing organization - run initial sync');
  });
});

describe('variance draft', () => {
  it('blocks OTHER without a note and a missing reason', () => {
    expect(varianceDraftMessage('Rice', { reason: null, note: '' })).toBe('Select a reason for Rice.');
    expect(varianceDraftMessage('Rice', { reason: 'OTHER', note: '   ' })).toBe(
      'Add a note for Rice when using Other.',
    );
    expect(varianceDraftMessage('Rice', { reason: 'OTHER', note: 'shelf' })).toBeNull();
    expect(varianceDraftMessage('Rice', { reason: 'PACK_BROKEN', note: '' })).toBeNull();
  });
});

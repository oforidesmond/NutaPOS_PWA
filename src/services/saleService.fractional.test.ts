import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/db/settingsRepository', () => ({
  settingsRepository: {
    getJson: vi.fn(),
    keys: {
      organization: 'organization',
      taxSettings: 'tax_settings',
      categories: 'categories',
      initialSyncDone: 'initial_sync_done',
    },
  },
}));

vi.mock('@/db/saleRepository', () => ({
  insertLocalSaleTx: vi.fn(),
}));

vi.mock('@/services/trialManager', () => ({
  trialManager: {
    checkLimit: vi.fn(async () => ({ trialActive: false, allowed: true, remaining: Number.POSITIVE_INFINITY })),
  },
}));

vi.mock('@/lib/saleDeviceInfo', () => ({
  buildSaleDeviceInfo: vi.fn(async () => ({ platform: 'test' })),
}));

vi.mock('@/lib/receiptNumber', () => ({
  generateReceiptNumber: vi.fn(() => 'RCP-TEST'),
}));

import { settingsRepository } from '@/db/settingsRepository';
import { insertLocalSaleTx } from '@/db/saleRepository';
import { saleService } from '@/services/saleService';
import type { CartLine } from '@/stores/cartStore';

const mockedGetJson = vi.mocked(settingsRepository.getJson);
const mockedInsert = vi.mocked(insertLocalSaleTx);

const halfLine: CartLine = {
  key: 'a',
  quantity: 0.5,
  product: {
    id: 'p1',
    barcode: null,
    sku: null,
    name: 'Item',
    price: 50,
    cost_price: 10,
    stock_quantity: 5,
    category_id: null,
    is_temporary: 0,
    auto_convert_json: null,
    synced_at: null,
    updated_at: '',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('sale-uuid-1' as ReturnType<typeof crypto.randomUUID>);
  mockedGetJson.mockImplementation(async (key: string) => {
    if (key === settingsRepository.keys.organization) {
      return { id: 'org-1', currency: 'GHS' };
    }
    if (key === 'tax_settings') {
      return {
        defaultTaxRate: 0,
        taxEnabled: false,
        maxDiscountPercent: 15,
        discountEnabled: true,
      };
    }
    return null;
  });
});

describe('saleService.completeSale fractional qty', () => {
  it('persists quantity 0.5 and stockDelta -0.5', async () => {
    const result = await saleService.completeSale({
      lines: [halfLine],
      paymentMethod: 'CASH',
      staffUserId: 'staff-1',
      branchId: null,
    });

    expect(result.saleId).toBe('sale-uuid-1');
    expect(mockedInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            quantity: 0.5,
            stockDelta: -0.5,
            totalPrice: 25,
          }),
        ],
        syncQueueEntries: expect.arrayContaining([
          expect.objectContaining({
            entityType: 'sale',
            payload: expect.objectContaining({
              body: expect.objectContaining({
                items: [expect.objectContaining({ quantity: 0.5, lineTotal: 25 })],
              }),
            }),
          }),
        ]),
      }),
    );
  });
});

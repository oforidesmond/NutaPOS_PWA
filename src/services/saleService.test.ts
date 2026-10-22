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

import { settingsRepository } from '@/db/settingsRepository';
import { discountSettings, taxSettings } from '@/lib/checkoutSettings';
import { previewTotals } from '@/lib/checkoutTotals';
import type { CartLine } from '@/stores/cartStore';

const mockedGetJson = vi.mocked(settingsRepository.getJson);

const sampleLines: CartLine[] = [
  {
    key: 'a',
    quantity: 2,
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
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  mockedGetJson.mockImplementation(async (key: string) => {
    if (key === 'tax_settings') {
      return {
        defaultTaxRate: 10,
        taxEnabled: true,
        maxDiscountPercent: 15,
        discountEnabled: true,
      };
    }
    return null;
  });
});

describe('checkoutSettings', () => {
  it('reads discount settings with strict enabled flag', async () => {
    expect(await discountSettings()).toEqual({ enabled: true, maxPercent: 15 });
    mockedGetJson.mockResolvedValue({ discountEnabled: false, maxDiscountPercent: 20 });
    expect(await discountSettings()).toEqual({ enabled: false, maxPercent: 0 });
  });

  it('reads tax settings', async () => {
    expect(await taxSettings()).toEqual({ rate: 10, enabled: true });
  });
});

describe('previewTotals', () => {
  it('computes subtotal tax and total without discount', async () => {
    const t = await previewTotals(sampleLines);
    expect(t.subtotal).toBe(100);
    expect(t.taxAmount).toBe(10);
    expect(t.discountAmount).toBe(0);
    expect(t.totalAmount).toBe(110);
  });

  it('subtracts discount from total after tax', async () => {
    const t = await previewTotals(sampleLines, 15);
    expect(t.subtotal).toBe(100);
    expect(t.taxAmount).toBe(10);
    expect(t.discountAmount).toBe(15);
    expect(t.totalAmount).toBe(95);
  });

  it('treats invalid discount as zero', async () => {
    const t = await previewTotals(sampleLines, Number.NaN);
    expect(t.discountAmount).toBe(0);
    expect(t.totalAmount).toBe(110);
  });

  it('supports fractional line quantities', async () => {
    const halfLine: CartLine[] = [
      {
        ...sampleLines[0],
        quantity: 0.5,
      },
    ];
    const t = await previewTotals(halfLine);
    expect(t.subtotal).toBe(25);
    expect(t.taxAmount).toBe(2.5);
    expect(t.totalAmount).toBe(27.5);
  });
});

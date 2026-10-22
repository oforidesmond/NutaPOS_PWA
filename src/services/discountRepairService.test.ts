import { beforeEach, describe, expect, it, vi } from 'vitest';
import { settingsRepository } from '@/db/settingsRepository';
import { updateSaleAmounts } from '@/db/saleRepository';
import { syncQueueRepository } from '@/db/syncQueueRepository';
import { isDiscountSyncError, repairFailedSaleDiscount } from '@/services/discountRepairService';

vi.mock('@/db/saleRepository', () => ({
  updateSaleAmounts: vi.fn(),
}));

vi.mock('@/db/syncQueueRepository', () => ({
  syncQueueRepository: {
    findSaleByEntityId: vi.fn(),
    updateSalePayloadAndRetry: vi.fn(),
  },
}));

vi.mock('@/db/settingsRepository', () => ({
  settingsRepository: {
    getJson: vi.fn(),
    keys: { organization: 'organization', taxSettings: 'tax_settings', categories: 'categories' },
  },
}));

const mockedGetJson = settingsRepository.getJson as unknown as ReturnType<typeof vi.fn>;
const mockedFindSale = syncQueueRepository.findSaleByEntityId as unknown as ReturnType<typeof vi.fn>;
const mockedUpdatePayload = syncQueueRepository.updateSalePayloadAndRetry as unknown as ReturnType<typeof vi.fn>;
const mockedUpdateAmounts = updateSaleAmounts as unknown as ReturnType<typeof vi.fn>;

const saleBody = {
  id: 'sale-1',
  receiptNumber: 'RCP-1',
  receipt_number: 'RCP-1',
  organizationId: 'org-1',
  createdById: 'user-1',
  subtotal: 100,
  taxRate: 10,
  taxAmount: 10,
  discountAmount: 20,
  totalAmount: 90,
  paymentMethod: 'CASH',
  currency: 'GHS',
  soldAt: '2025-01-01T00:00:00.000Z',
  items: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetJson.mockImplementation((key: string) => {
    if (key === 'tax_settings') {
      return { maxDiscountPercent: 15, discountEnabled: true };
    }
    return null;
  });
  mockedFindSale.mockReturnValue({
    id: 1,
    payload: JSON.stringify({ idempotencyKey: 'sale-1', body: saleBody }),
  });
});

describe('discountRepairService', () => {
  describe('isDiscountSyncError', () => {
    it('recognises discount DLQ codes', () => {
      expect(isDiscountSyncError('DISCOUNT_EXCEEDS_LIMIT')).toBe(true);
      expect(isDiscountSyncError('DISCOUNT_NOT_ALLOWED')).toBe(true);
      expect(isDiscountSyncError('SALE_PRODUCT_MISSING')).toBe(false);
    });
  });

  describe('repairFailedSaleDiscount', () => {
    it('updates local sale and re-queues with corrected discount', async () => {
      await repairFailedSaleDiscount('sale-1', 10);
      expect(mockedUpdateAmounts).toHaveBeenCalledWith('sale-1', {
        discountAmount: 10,
        totalAmount: 100,
      });
      expect(mockedUpdatePayload).toHaveBeenCalledWith('sale-1', {
        idempotencyKey: 'sale-1',
        body: expect.objectContaining({
          discountAmount: 10,
          totalAmount: 100,
        }),
      });
    });

    it('throws when discount exceeds cap', async () => {
      await expect(repairFailedSaleDiscount('sale-1', 20)).rejects.toThrow(/Maximum discount/);
      expect(mockedUpdatePayload).not.toHaveBeenCalled();
    });
  });
});

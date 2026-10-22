import { beforeEach, describe, expect, it } from 'vitest';
import { db, type Sale } from '@/db/schema';
import { searchSales } from '@/db/saleRepository';

function sale(overrides: Partial<Sale> & Pick<Sale, 'id' | 'sold_at'>): Sale {
  return {
    total_amount: 10,
    tax_amount: 0,
    discount_amount: 0,
    payment_method: 'CASH',
    synced_at: null,
    staff_id: 'staff-1',
    branch_id: null,
    is_return: 0,
    original_sale_id: null,
    receipt_number: `RCP-${overrides.id}`,
    ...overrides,
  };
}

describe('searchSales', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await db.sales.bulkAdd([
      sale({ id: 'old', sold_at: '2020-01-01T00:00:00.000Z', receipt_number: 'RCP-OLD', total_amount: 4 }),
      sale({ id: 'week', sold_at: new Date().toISOString(), receipt_number: 'RCP-WEEK', total_amount: 12, payment_method: 'CARD' }),
      sale({ id: 'return', sold_at: new Date().toISOString(), receipt_number: 'RET-1', is_return: 1, total_amount: 12 }),
    ]);
  });

  it('keeps non-return sales inside the default week window', async () => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    const rows = await searchSales({ dateFrom: start.toISOString() }, 200);
    expect(rows.map((row) => row.id)).toEqual(['week']);
  });

  it('matches a receipt substring and skips returns', async () => {
    const rows = await searchSales({ receiptQuery: 'old' }, 200);
    expect(rows.map((row) => row.id)).toEqual(['old']);
  });
});

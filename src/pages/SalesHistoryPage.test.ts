import { describe, expect, it } from 'vitest';
import type { Sale } from '@/db/schema';
import { syncStatusSummary } from '@/pages/SalesHistoryPage';

describe('syncStatusSummary', () => {
  const base = {
    receipt_number: 'R1',
    total_amount: 10,
    payment_method: 'CASH',
    sold_at: '2026-01-01T12:00:00.000Z',
    is_return: 0,
  } as Sale;

  it('returns null for an empty list', () => {
    expect(syncStatusSummary([])).toBeNull();
  });

  it('reports all synced when every sale has synced_at', () => {
    const sales = [
      { ...base, id: 'a', synced_at: '2026-01-01T13:00:00.000Z' },
      { ...base, id: 'b', synced_at: '2026-01-01T14:00:00.000Z' },
    ] as Sale[];
    expect(syncStatusSummary(sales)).toEqual({
      pendingCount: 0,
      syncedCount: 2,
      message: 'All 2 sales synced',
    });
  });

  it('reports pending count when some sales are unsynced', () => {
    const sales = [
      { ...base, id: 'a', synced_at: '2026-01-01T13:00:00.000Z' },
      { ...base, id: 'b', synced_at: null },
      { ...base, id: 'c', synced_at: null },
    ] as Sale[];
    expect(syncStatusSummary(sales)).toEqual({
      pendingCount: 2,
      syncedCount: 1,
      message: '2 of 3 sales pending sync',
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncFailureResolution } from '@/api/syncFailuresApi';
import { markSynced } from '@/db/saleRepository';
import { syncQueueRepository, type SyncQueueRow } from '@/db/syncQueueRepository';
import { syncWorker } from '@/services/syncWorker';
import { applyResolutionItem } from '@/services/syncFailureResolutionPull';

vi.mock('@/api/client', () => ({
  getStoredAccessToken: vi.fn().mockResolvedValue('access-token'),
}));

vi.mock('@/api/syncFailuresApi', () => ({
  fetchSyncFailureResolutions: vi.fn(),
}));

vi.mock('@/db/saleRepository', () => ({
  markSynced: vi.fn(),
}));

vi.mock('@/db/syncQueueRepository', () => ({
  syncQueueRepository: {
    findByFailureId: vi.fn(),
    applyResolutionRetry: vi.fn(),
    markClearedAdmin: vi.fn(),
  },
}));

vi.mock('@/services/syncWorker', () => ({
  syncWorker: { trigger: vi.fn() },
}));

const mockedFindByFailureId = syncQueueRepository.findByFailureId as unknown as ReturnType<typeof vi.fn>;
const mockedApplyResolutionRetry = syncQueueRepository.applyResolutionRetry as unknown as ReturnType<typeof vi.fn>;
const mockedMarkClearedAdmin = syncQueueRepository.markClearedAdmin as unknown as ReturnType<typeof vi.fn>;
const mockedMarkSynced = markSynced as unknown as ReturnType<typeof vi.fn>;
const mockedTrigger = syncWorker.trigger as unknown as ReturnType<typeof vi.fn>;

function makeRow(overrides: Partial<SyncQueueRow> = {}): SyncQueueRow {
  return {
    id: 7,
    entity_type: 'sale',
    entity_id: 'local-sale-1',
    operation: 'CREATE',
    payload: { idempotencyKey: 'local-sale-1', body: { id: 'local-sale-1' } },
    status: 'PENDING_SUPER_ADMIN',
    attempt_count: 0,
    created_at: '2025-01-01T00:00:00.000Z',
    last_attempt_at: '2025-01-01T00:00:00.000Z',
    last_error: null,
    failure_id: 'failure-1',
    error_code: 'SALE_PRODUCT_MISSING',
    admin_message: 'Sent to Admin for review.',
    last_failed_at: '2025-01-01T00:00:00.000Z',
    resolution_action: null,
    resolution_status: null,
    resolved_at: null,
    admin_applied_sale_id: null,
    ...overrides,
  };
}

function makeItem(overrides: Partial<SyncFailureResolution> = {}): SyncFailureResolution {
  return {
    failureId: 'failure-1',
    entityType: 'SALE',
    entityId: 'local-sale-1',
    action: 'RETRY',
    status: 'RESOLVED_RETRY',
    resolvedAt: '2025-02-01T00:00:00.000Z',
    appliedSaleId: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('applyResolutionItem', () => {
  it('returns false and is a no-op when no local row matches the failureId', async () => {
    mockedFindByFailureId.mockReturnValue(null);
    const applied = await applyResolutionItem(makeItem());
    expect(applied).toBe(false);
    expect(mockedApplyResolutionRetry).not.toHaveBeenCalled();
    expect(mockedMarkClearedAdmin).not.toHaveBeenCalled();
    expect(mockedMarkSynced).not.toHaveBeenCalled();
  });

  it('ignores entityType mismatches without applying any state change', async () => {
    mockedFindByFailureId.mockReturnValue(makeRow({ entity_type: 'sale' }));
    const applied = await applyResolutionItem(makeItem({ entityType: 'INVENTORY_EVENT' }));
    expect(applied).toBe(false);
    expect(mockedApplyResolutionRetry).not.toHaveBeenCalled();
    expect(mockedMarkClearedAdmin).not.toHaveBeenCalled();
    expect(mockedMarkSynced).not.toHaveBeenCalled();
  });

  it('matches entityType case-insensitively (local "sale" vs remote "SALE")', async () => {
    const row = makeRow({ entity_type: 'sale' });
    mockedFindByFailureId.mockReturnValue(row);
    const applied = await applyResolutionItem(makeItem({ entityType: 'SALE', action: 'IGNORE_CLEAR', status: 'ARCHIVED' }));
    expect(applied).toBe(true);
    expect(mockedMarkClearedAdmin).toHaveBeenCalled();
  });

  describe('RETRY', () => {
    it('restores the row to retryable PENDING with preserved payload', async () => {
      const row = makeRow({ entity_type: 'sale' });
      mockedFindByFailureId.mockReturnValue(row);
      const item = makeItem({
        action: 'RETRY',
        status: 'RESOLVED_RETRY',
        resolvedAt: '2025-02-01T00:00:00.000Z',
      });
      const applied = await applyResolutionItem(item);
      expect(applied).toBe(true);
      expect(mockedApplyResolutionRetry).toHaveBeenCalledWith(row.id, '2025-02-01T00:00:00.000Z');
      expect(mockedMarkClearedAdmin).not.toHaveBeenCalled();
      expect(mockedMarkSynced).not.toHaveBeenCalled();
    });
  });

  describe('IGNORE_CLEAR', () => {
    it('archives the row in CLEARED_ADMIN and never marks the sale synced', async () => {
      const row = makeRow({ entity_type: 'sale' });
      mockedFindByFailureId.mockReturnValue(row);
      const item = makeItem({
        action: 'IGNORE_CLEAR',
        status: 'ARCHIVED',
        appliedSaleId: null,
      });
      const applied = await applyResolutionItem(item);
      expect(applied).toBe(true);
      expect(mockedMarkClearedAdmin).toHaveBeenCalledWith(row.id, {
        action: 'IGNORE_CLEAR',
        status: 'ARCHIVED',
        resolvedAt: item.resolvedAt,
        appliedSaleId: null,
      });
      expect(mockedMarkSynced).not.toHaveBeenCalled();
      expect(mockedApplyResolutionRetry).not.toHaveBeenCalled();
    });
  });

  describe('FIX_AND_APPLY', () => {
    it('marks the original local sale synced ONLY when appliedSaleId equals the local entity_id', async () => {
      const row = makeRow({ entity_type: 'sale', entity_id: 'local-sale-1' });
      mockedFindByFailureId.mockReturnValue(row);
      const item = makeItem({
        action: 'FIX_AND_APPLY',
        status: 'APPLIED',
        appliedSaleId: 'local-sale-1',
        resolvedAt: '2025-02-02T00:00:00.000Z',
      });
      const applied = await applyResolutionItem(item);
      expect(applied).toBe(true);
      expect(mockedMarkSynced).toHaveBeenCalledWith('local-sale-1', '2025-02-02T00:00:00.000Z');
      expect(mockedMarkClearedAdmin).toHaveBeenCalledWith(row.id, {
        action: 'FIX_AND_APPLY',
        status: 'APPLIED',
        resolvedAt: '2025-02-02T00:00:00.000Z',
        appliedSaleId: 'local-sale-1',
      });
    });

    it('does NOT mark the original local sale synced when appliedSaleId differs', async () => {
      const row = makeRow({ entity_type: 'sale', entity_id: 'local-sale-1' });
      mockedFindByFailureId.mockReturnValue(row);
      const item = makeItem({
        action: 'FIX_AND_APPLY',
        status: 'APPLIED',
        appliedSaleId: 'admin-applied-different-sale',
        resolvedAt: '2025-02-03T00:00:00.000Z',
      });
      const applied = await applyResolutionItem(item);
      expect(applied).toBe(true);
      expect(mockedMarkSynced).not.toHaveBeenCalled();
      expect(mockedMarkClearedAdmin).toHaveBeenCalledWith(row.id, {
        action: 'FIX_AND_APPLY',
        status: 'APPLIED',
        resolvedAt: '2025-02-03T00:00:00.000Z',
        appliedSaleId: 'admin-applied-different-sale',
      });
    });

    it('does NOT mark synced when appliedSaleId is missing (null)', async () => {
      const row = makeRow({ entity_type: 'sale', entity_id: 'local-sale-1' });
      mockedFindByFailureId.mockReturnValue(row);
      const item = makeItem({
        action: 'FIX_AND_APPLY',
        status: 'APPLIED',
        appliedSaleId: null,
      });
      await applyResolutionItem(item);
      expect(mockedMarkSynced).not.toHaveBeenCalled();
      expect(mockedMarkClearedAdmin).toHaveBeenCalled();
    });
  });

  it('does not trigger the worker from applyResolutionItem directly', async () => {
    const row = makeRow({ entity_type: 'sale' });
    mockedFindByFailureId.mockReturnValue(row);
    await applyResolutionItem(makeItem({ action: 'RETRY' }));
    expect(mockedTrigger).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { db, type SyncQueueRow } from '@/db/schema';
import { syncQueueRepository } from '@/db/syncQueueRepository';

function row(overrides: Partial<SyncQueueRow> = {}): SyncQueueRow {
  return {
    entity_type: 'sale',
    entity_id: 'sale-1',
    operation: 'CREATE',
    payload: { idempotencyKey: 'sale-1', body: { id: 'sale-1', deviceInfo: { deviceUuid: 'dev-1' } } },
    status: 'PENDING',
    attempt_count: 0,
    created_at: '2025-01-01T00:00:00.000Z',
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

describe('syncQueueRepository', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('listPending() never selects PENDING_SUPER_ADMIN or CLEARED_ADMIN', async () => {
    await db.sync_queue.bulkAdd([
      row({ entity_id: 'pending', status: 'PENDING', created_at: '2025-01-01T00:00:00.000Z' }),
      row({ entity_id: 'retry', status: 'FAILED', attempt_count: 2, created_at: '2025-01-02T00:00:00.000Z' }),
      row({ entity_id: 'exhausted', status: 'FAILED', attempt_count: 3, created_at: '2025-01-03T00:00:00.000Z' }),
      row({ entity_id: 'dlq', status: 'PENDING_SUPER_ADMIN', created_at: '2025-01-04T00:00:00.000Z' }),
      row({ entity_id: 'cleared', status: 'CLEARED_ADMIN', created_at: '2025-01-05T00:00:00.000Z' }),
    ]);

    const pending = await syncQueueRepository.listPending(50);
    expect(pending.map((item) => item.entity_id)).toEqual(['pending', 'retry']);
  });

  it('markPendingSuperAdmin() persists DLQ metadata and sets terminal status', async () => {
    const id = await db.sync_queue.add(row());
    await syncQueueRepository.markPendingSuperAdmin(id, {
      failureId: 'failure-abc',
      errorCode: 'SALE_PRODUCT_MISSING',
      adminMessage: 'Sent to Admin for review.',
      lastFailedAt: '2025-01-01T00:00:00.000Z',
    });
    const saved = await db.sync_queue.get(id);
    expect(saved?.status).toBe('PENDING_SUPER_ADMIN');
    expect(saved?.failure_id).toBe('failure-abc');
    expect(saved?.error_code).toBe('SALE_PRODUCT_MISSING');
    expect(saved?.admin_message).toBe('Sent to Admin for review.');
    expect(saved?.last_failed_at).toBe('2025-01-01T00:00:00.000Z');
    expect(saved?.payload).toEqual(row().payload);
  });

  it('applyResolutionRetry() restores PENDING, clears DLQ metadata, and keeps deviceInfo', async () => {
    const id = await db.sync_queue.add(
      row({
        status: 'PENDING_SUPER_ADMIN',
        attempt_count: 2,
        failure_id: 'failure-abc',
        error_code: 'SALE_PRODUCT_MISSING',
        admin_message: 'Sent to Admin for review.',
        last_failed_at: '2025-01-01T00:00:00.000Z',
        last_error: 'Sent to Admin for review.',
      }),
    );
    await syncQueueRepository.applyResolutionRetry(id, '2025-02-01T00:00:00.000Z');
    const saved = await db.sync_queue.get(id);
    expect(saved?.status).toBe('PENDING');
    expect(saved?.attempt_count).toBe(0);
    expect(saved?.failure_id).toBeNull();
    expect(saved?.error_code).toBeNull();
    expect(saved?.admin_message).toBeNull();
    expect(saved?.last_failed_at).toBeNull();
    expect(saved?.resolution_action).toBe('RETRY');
    expect(saved?.resolution_status).toBe('RESOLVED_RETRY');
    expect(saved?.resolved_at).toBe('2025-02-01T00:00:00.000Z');
    expect(saved?.payload).toEqual(row().payload);
  });

  it('markClearedAdmin() archives the row in CLEARED_ADMIN with audit fields', async () => {
    const id = await db.sync_queue.add(row({ status: 'PENDING_SUPER_ADMIN' }));
    await syncQueueRepository.markClearedAdmin(id, {
      action: 'FIX_AND_APPLY',
      status: 'APPLIED',
      resolvedAt: '2025-03-01T00:00:00.000Z',
      appliedSaleId: 'admin-applied-sale-2',
    });
    const saved = await db.sync_queue.get(id);
    expect(saved?.status).toBe('CLEARED_ADMIN');
    expect(saved?.resolution_action).toBe('FIX_AND_APPLY');
    expect(saved?.resolution_status).toBe('APPLIED');
    expect(saved?.resolved_at).toBe('2025-03-01T00:00:00.000Z');
    expect(saved?.admin_applied_sale_id).toBe('admin-applied-sale-2');
  });

  it('resetAllFailed() only resets FAILED rows (NEVER PENDING_SUPER_ADMIN)', async () => {
    await db.sync_queue.bulkAdd([
      row({ entity_id: 'failed', status: 'FAILED', attempt_count: 3 }),
      row({ entity_id: 'dlq', status: 'PENDING_SUPER_ADMIN', failure_id: 'f1' }),
      row({ entity_id: 'pending', status: 'PENDING' }),
    ]);
    await syncQueueRepository.resetAllFailed();
    const rows = await db.sync_queue.toArray();
    const byEntity = Object.fromEntries(rows.map((item) => [item.entity_id, item]));
    expect(byEntity.failed?.status).toBe('PENDING');
    expect(byEntity.failed?.attempt_count).toBe(0);
    expect(byEntity.dlq?.status).toBe('PENDING_SUPER_ADMIN');
    expect(byEntity.pending?.status).toBe('PENDING');
  });

  it('countPendingAdminReview() counts only PENDING_SUPER_ADMIN', async () => {
    await db.sync_queue.bulkAdd([
      row({ entity_id: 'a', status: 'PENDING_SUPER_ADMIN' }),
      row({ entity_id: 'b', status: 'PENDING_SUPER_ADMIN' }),
      row({ entity_id: 'c', status: 'PENDING_SUPER_ADMIN' }),
      row({ entity_id: 'd', status: 'FAILED', attempt_count: 3 }),
      row({ entity_id: 'e', status: 'CLEARED_ADMIN' }),
    ]);
    expect(await syncQueueRepository.countPendingAdminReview()).toBe(3);
  });

  it('countTransportFailures() counts only FAILED >= 3 attempts (no DLQ)', async () => {
    await db.sync_queue.bulkAdd([
      row({ entity_id: 'a', status: 'FAILED', attempt_count: 3 }),
      row({ entity_id: 'b', status: 'FAILED', attempt_count: 4 }),
      row({ entity_id: 'c', status: 'FAILED', attempt_count: 2 }),
      row({ entity_id: 'd', status: 'PENDING_SUPER_ADMIN' }),
    ]);
    expect(await syncQueueRepository.countTransportFailures()).toBe(2);
  });

  it('updateSalePayloadAndRetry() resets to PENDING and clears DLQ metadata', async () => {
    await db.sync_queue.add(
      row({
        entity_id: 'sale-1',
        status: 'PENDING_SUPER_ADMIN',
        failure_id: 'failure-abc',
        error_code: 'DISCOUNT_EXCEEDS_LIMIT',
        admin_message: 'too high',
        last_failed_at: '2025-01-01T00:00:00.000Z',
      }),
    );
    await syncQueueRepository.updateSalePayloadAndRetry('sale-1', { body: { id: 'sale-1' } });
    const saved = await db.sync_queue.where('entity_id').equals('sale-1').first();
    expect(saved?.status).toBe('PENDING');
    expect(saved?.failure_id).toBeNull();
    expect(saved?.error_code).toBeNull();
    expect(saved?.admin_message).toBeNull();
    expect(saved?.last_failed_at).toBeNull();
    expect(saved?.payload).toEqual({ body: { id: 'sale-1' } });
  });
});

import { db, type SyncQueueRow, type SyncStatus } from '@/db/schema';

export type { SyncQueueRow };

export type DlqFailureMetadata = {
  failureId: string;
  errorCode: string;
  adminMessage?: string | null;
  lastFailedAt: string;
};

export type ResolutionApplyInput = {
  action: 'RETRY' | 'IGNORE_CLEAR' | 'FIX_AND_APPLY';
  status: 'RESOLVED_RETRY' | 'ARCHIVED' | 'APPLIED';
  resolvedAt: string | null;
  appliedSaleId?: string | null;
};

function byCreatedThenId(a: SyncQueueRow, b: SyncQueueRow): number {
  if (a.created_at < b.created_at) return -1;
  if (a.created_at > b.created_at) return 1;
  return (a.id ?? 0) - (b.id ?? 0);
}

function byCreatedDesc(a: SyncQueueRow, b: SyncQueueRow): number {
  if (a.created_at < b.created_at) return 1;
  if (a.created_at > b.created_at) return -1;
  return (b.id ?? 0) - (a.id ?? 0);
}

export const syncQueueRepository = {
  /**
   * A tab can close after a row is marked `SYNCING` and before the request finishes.
   * Put those rows back to `PENDING` without burning an attempt.
   */
  async reclaimSyncing(): Promise<void> {
    const rows = await db.sync_queue.filter((row) => row.status === 'SYNCING').toArray();
    for (const row of rows) {
      if (row.id == null) continue;
      await db.sync_queue.update(row.id, { status: 'PENDING' });
    }
  },

  /**
   * Retryable backlog. Excludes `PENDING_SUPER_ADMIN` and `CLEARED_ADMIN`
   * so a business failure never re-enters the automatic loop.
   */
  async listPending(limit = 50): Promise<SyncQueueRow[]> {
    const rows = await db.sync_queue.toArray();
    return rows
      .filter((row) => row.status === 'PENDING' || (row.status === 'FAILED' && row.attempt_count < 3))
      .sort(byCreatedThenId)
      .slice(0, limit);
  },

  async updateStatus(
    id: number,
    status: SyncStatus | string,
    patch: { attempt_count?: number; last_attempt_at?: string | null } = {},
  ): Promise<void> {
    const changes: Partial<SyncQueueRow> = { status };
    if (patch.attempt_count !== undefined) changes.attempt_count = patch.attempt_count;
    if (patch.last_attempt_at !== undefined) changes.last_attempt_at = patch.last_attempt_at;
    await db.sync_queue.update(id, changes);
  },

  async incrementFailure(id: number, currentAttempts: number, errorMessage?: string | null): Promise<void> {
    await db.sync_queue.update(id, {
      status: 'FAILED',
      attempt_count: currentAttempts + 1,
      last_attempt_at: new Date().toISOString(),
      last_error: errorMessage ?? null,
    });
  },

  /** Terminal DLQ transition. The original payload is left intact. */
  async markPendingSuperAdmin(id: number, meta: DlqFailureMetadata): Promise<void> {
    await db.sync_queue.update(id, {
      status: 'PENDING_SUPER_ADMIN',
      failure_id: meta.failureId,
      error_code: meta.errorCode,
      admin_message: meta.adminMessage ?? null,
      last_failed_at: meta.lastFailedAt,
      last_attempt_at: meta.lastFailedAt,
      last_error: meta.adminMessage ?? meta.errorCode,
    });
  },

  async findByFailureId(failureId: string): Promise<SyncQueueRow | null> {
    const row = await db.sync_queue.where('failure_id').equals(failureId).first();
    return row ?? null;
  },

  async findSaleByEntityId(saleId: string): Promise<SyncQueueRow | null> {
    const rows = await db.sync_queue.where('entity_id').equals(saleId).toArray();
    const sales = rows.filter((row) => row.entity_type === 'sale');
    sales.sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
    return sales[0] ?? null;
  },

  /**
   * Admin RETRY: clear DLQ metadata and restore PENDING.
   * The payload, including `deviceInfo`, is not rewritten.
   */
  async applyResolutionRetry(id: number, resolvedAt: string | null): Promise<void> {
    await db.sync_queue.update(id, {
      status: 'PENDING',
      attempt_count: 0,
      last_attempt_at: null,
      last_error: null,
      failure_id: null,
      error_code: null,
      admin_message: null,
      last_failed_at: null,
      resolution_action: 'RETRY',
      resolution_status: 'RESOLVED_RETRY',
      resolved_at: resolvedAt,
      admin_applied_sale_id: null,
    });
  },

  async markClearedAdmin(id: number, input: ResolutionApplyInput): Promise<void> {
    await db.sync_queue.update(id, {
      status: 'CLEARED_ADMIN',
      resolution_action: input.action,
      resolution_status: input.status,
      resolved_at: input.resolvedAt,
      admin_applied_sale_id: input.appliedSaleId ?? null,
    });
  },

  async listPendingAdminReviewSales(limit = 50): Promise<SyncQueueRow[]> {
    const rows = await db.sync_queue.toArray();
    return rows
      .filter((row) => row.entity_type === 'sale' && row.status === 'PENDING_SUPER_ADMIN')
      .sort(byCreatedDesc)
      .slice(0, limit);
  },

  async countPendingAdminReview(): Promise<number> {
    return db.sync_queue.filter((row) => row.status === 'PENDING_SUPER_ADMIN').count();
  },

  async countTransportFailures(): Promise<number> {
    return db.sync_queue.filter((row) => row.status === 'FAILED' && row.attempt_count >= 3).count();
  },

  async listFailedSales(limit = 50): Promise<SyncQueueRow[]> {
    const rows = await db.sync_queue.toArray();
    return rows
      .filter((row) => row.entity_type === 'sale' && row.status === 'FAILED' && row.attempt_count >= 3)
      .sort(byCreatedDesc)
      .slice(0, limit);
  },

  async updateSalePayloadAndRetry(saleId: string, payload: object): Promise<void> {
    const rows = await db.sync_queue.where('entity_id').equals(saleId).toArray();
    for (const row of rows) {
      if (row.entity_type !== 'sale' || row.id == null) continue;
      await db.sync_queue.update(row.id, {
        payload: payload as Record<string, unknown>,
        status: 'PENDING',
        attempt_count: 0,
        last_attempt_at: null,
        last_error: null,
        failure_id: null,
        error_code: null,
        admin_message: null,
        last_failed_at: null,
      });
    }
  },

  /** Resets transport `FAILED` rows only. DLQ rows stay `PENDING_SUPER_ADMIN`. */
  async resetAllFailed(): Promise<void> {
    const rows = await db.sync_queue.filter((row) => row.status === 'FAILED').toArray();
    for (const row of rows) {
      if (row.id == null) continue;
      await db.sync_queue.update(row.id, {
        status: 'PENDING',
        attempt_count: 0,
        last_attempt_at: null,
        last_error: null,
      });
    }
  },
};

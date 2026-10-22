import { getStoredAccessToken } from '@/api/client';
import {
  fetchSyncFailureResolutions,
  type SyncFailureResolution,
} from '@/api/syncFailuresApi';
import { prefsRepository } from '@/db/prefsRepository';
import { markSynced } from '@/db/saleRepository';
import { syncQueueRepository } from '@/db/syncQueueRepository';

let pullInFlight: Promise<boolean> | null = null;

const EPOCH_START = '1970-01-01T00:00:00.000Z';

/**
 * Applies one admin resolution.
 *
 * - RETRY clears DLQ metadata and restores PENDING. The payload is kept.
 * - IGNORE_CLEAR archives the row as CLEARED_ADMIN.
 * - FIX_AND_APPLY archives the row. The local sale is marked synced only
 *   when appliedSaleId equals the local sale id.
 *
 * Returns true when a local row was updated.
 */
export async function applyResolutionItem(item: SyncFailureResolution): Promise<boolean> {
  const row = await syncQueueRepository.findByFailureId(item.failureId);
  if (!row || row.id == null) return false;

  if (row.entity_type.toLowerCase() !== item.entityType.toLowerCase()) {
    return false;
  }

  const isSaleRow = row.entity_type.toLowerCase() === 'sale';

  switch (item.action) {
    case 'RETRY': {
      await syncQueueRepository.applyResolutionRetry(row.id, item.resolvedAt);
      return true;
    }
    case 'IGNORE_CLEAR': {
      await syncQueueRepository.markClearedAdmin(row.id, {
        action: item.action,
        status: item.status,
        resolvedAt: item.resolvedAt,
        appliedSaleId: null,
      });
      return true;
    }
    case 'FIX_AND_APPLY': {
      const sameSale = isSaleRow && item.appliedSaleId != null && item.appliedSaleId === row.entity_id;
      if (sameSale) {
        await markSynced(row.entity_id, item.resolvedAt ?? new Date().toISOString());
      }
      await syncQueueRepository.markClearedAdmin(row.id, {
        action: item.action,
        status: item.status,
        resolvedAt: item.resolvedAt,
        appliedSaleId: item.appliedSaleId,
      });
      return true;
    }
    default:
      return false;
  }
}

async function pullSyncFailureResolutionsImpl(): Promise<boolean> {
  const stored = await prefsRepository.get<string>(prefsRepository.keys.lastSyncFailureResolutionPull);
  const since = typeof stored === 'string' && stored.length > 0 ? stored : EPOCH_START;
  const res = await fetchSyncFailureResolutions(since);
  if (!res) return false;

  let appliedAny = false;
  let restoredPending = false;
  for (const item of res.data) {
    const applied = await applyResolutionItem(item);
    if (applied) {
      appliedAny = true;
      if (item.action === 'RETRY') restoredPending = true;
    }
  }

  await prefsRepository.set(prefsRepository.keys.lastSyncFailureResolutionPull, res.updatedAt);

  if (restoredPending) {
    const { syncWorker } = await import('@/services/syncWorker');
    syncWorker.trigger();
  }

  return appliedAny;
}

export async function pullSyncFailureResolutions(): Promise<boolean> {
  if (!(await getStoredAccessToken())) return false;
  if (pullInFlight) return pullInFlight;
  pullInFlight = pullSyncFailureResolutionsImpl().finally(() => {
    pullInFlight = null;
  });
  return pullInFlight;
}

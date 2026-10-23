import { isAxiosError } from 'axios';
import { getStoredAccessToken } from '@/api/client';
import { parseStaffSaleErrorMessages, postStaffSale, type StaffSalePayload } from '@/api/salesApi';
import { postTemporaryItem, type TemporaryItemPayload } from '@/api/temporaryItemsApi';
import { productRepository } from '@/db/productRepository';
import { markSynced } from '@/db/saleRepository';
import { syncQueueRepository, type SyncQueueRow } from '@/db/syncQueueRepository';
import { ensureSaleDeviceInfo } from '@/lib/saleDeviceInfo';
import { pullSyncFailureResolutions } from '@/services/syncFailureResolutionPull';

let processQueueInFlight: Promise<void> | null = null;
const queueSettledListeners = new Set<() => void>();
const TEMPORARY_ITEM_VARIANCE_REASON = 'PHYSICAL_STOCK_PRESENT' as const;

function isBrowserOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

function readPayload<T extends Record<string, unknown>>(payload: unknown): T {
  if (!payload || typeof payload !== 'object') {
    throw new Error('sync_queue payload missing');
  }
  return payload as T;
}

async function saleHasUnsyncedTemporaryProducts(body: StaffSalePayload): Promise<boolean> {
  for (const item of body.items) {
    const product = await productRepository.findById(item.productId);
    if (product?.is_temporary === 1 && !product.synced_at) return true;
  }
  return false;
}

async function normalizeSalePayload(body: StaffSalePayload): Promise<StaffSalePayload> {
  let changed = false;
  const items = [];
  for (const item of body.items) {
    const product = await productRepository.findById(item.productId);
    if (product?.is_temporary === 1 && !item.varianceReason) {
      changed = true;
      items.push({ ...item, varianceReason: TEMPORARY_ITEM_VARIANCE_REASON });
    } else {
      items.push(item);
    }
  }
  return changed ? { ...body, items } : body;
}

function describeQueueError(entityType: string, error: unknown): string {
  if (entityType === 'sale') {
    const msgs = parseStaffSaleErrorMessages(error);
    if (msgs.length > 0) return msgs.join(' · ');
  }
  if (isAxiosError(error)) {
    const status = error.response?.status;
    return status ? `HTTP ${status}: ${error.message}` : error.message;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

async function processOne(item: SyncQueueRow, now: string): Promise<'temp' | 'deferred' | 'done'> {
  if (item.id == null) throw new Error('sync_queue row missing id');
  await syncQueueRepository.updateStatus(item.id, 'SYNCING', { last_attempt_at: now });

  if (item.entity_type === 'sale') {
    const payload = readPayload<{ idempotencyKey?: string; body?: StaffSalePayload }>(item.payload);
    const rawBody = payload.body;
    if (!rawBody) throw new Error('sync_queue sale missing body');
    const normalized = await normalizeSalePayload(rawBody);
    const body = await ensureSaleDeviceInfo(normalized);
    if (await saleHasUnsyncedTemporaryProducts(body)) {
      await syncQueueRepository.updateStatus(item.id, 'PENDING', { last_attempt_at: now });
      return 'deferred';
    }
    const outcome = await postStaffSale(body);
    if (outcome.kind === 'success' || outcome.kind === 'duplicate-success') {
      const syncedAt = outcome.syncedAt ?? new Date().toISOString();
      await markSynced(body.id, syncedAt);
      await syncQueueRepository.updateStatus(item.id, 'COMPLETED');
      return 'done';
    }
    await syncQueueRepository.markPendingSuperAdmin(item.id, {
      failureId: outcome.failure.failureId,
      errorCode: outcome.failure.errorCode,
      adminMessage: outcome.failure.message ?? null,
      lastFailedAt: new Date().toISOString(),
    });
    return 'done';
  }

  if (item.entity_type === 'temporary_item') {
    const payload = readPayload<{ body?: TemporaryItemPayload }>(item.payload);
    const body = payload.body;
    if (!body) throw new Error('sync_queue temporary_item missing body');
    await postTemporaryItem(body);
    const syncedAt = new Date().toISOString();
    await productRepository.markSyncedAt(body.local_product_id, syncedAt);
    await syncQueueRepository.updateStatus(item.id, 'COMPLETED');
    return 'temp';
  }

  await syncQueueRepository.updateStatus(item.id, 'COMPLETED');
  return 'done';
}

async function processQueueImpl(): Promise<void> {
  if (!(await getStoredAccessToken())) return;
  if (!isBrowserOnline()) return;

  await syncQueueRepository.reclaimSyncing();
  await pullSyncFailureResolutions();

  for (let pass = 0; pass < 3; pass += 1) {
    const pending = await syncQueueRepository.listPending(50);
    if (pending.length === 0) return;

    let syncedTemporaryItemThisPass = false;
    let deferredSaleThisPass = false;

    for (const item of pending) {
      const now = new Date().toISOString();
      try {
        const kind = await processOne(item, now);
        if (kind === 'temp') syncedTemporaryItemThisPass = true;
        if (kind === 'deferred') deferredSaleThisPass = true;
      } catch (error) {
        if (item.id == null) continue;
        await syncQueueRepository.incrementFailure(item.id, item.attempt_count, describeQueueError(item.entity_type, error));
      }
    }

    if (!(deferredSaleThisPass && syncedTemporaryItemThisPass)) {
      break;
    }
  }
}

function notifyQueueSettled(): void {
  for (const listener of queueSettledListeners) listener();
}

export const syncWorker = {
  async processQueue(): Promise<void> {
    if (processQueueInFlight) return processQueueInFlight;
    processQueueInFlight = processQueueImpl().finally(() => {
      processQueueInFlight = null;
      notifyQueueSettled();
    });
    return processQueueInFlight;
  },

  /** Runs after each worker run finishes, including a run that uploaded nothing. */
  onSettled(listener: () => void): () => void {
    queueSettledListeners.add(listener);
    return () => {
      queueSettledListeners.delete(listener);
    };
  },

  trigger(): void {
    void this.processQueue();
  },
};

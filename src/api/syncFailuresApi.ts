import { api } from '@/api/client';
import { buildApiPath } from '@/lib/env';

export type ResolutionAction = 'RETRY' | 'IGNORE_CLEAR' | 'FIX_AND_APPLY';
export type ResolutionStatus = 'RESOLVED_RETRY' | 'ARCHIVED' | 'APPLIED';

export type SyncFailureResolution = {
  failureId: string;
  entityType: string;
  entityId: string;
  action: ResolutionAction;
  status: ResolutionStatus;
  resolvedAt: string | null;
  appliedSaleId: string | null;
};

export type SyncFailureResolutionsResponse = {
  data: SyncFailureResolution[];
  updatedAt: string;
};

function isResolutionAction(v: unknown): v is ResolutionAction {
  return v === 'RETRY' || v === 'IGNORE_CLEAR' || v === 'FIX_AND_APPLY';
}

function isResolutionStatus(v: unknown): v is ResolutionStatus {
  return v === 'RESOLVED_RETRY' || v === 'ARCHIVED' || v === 'APPLIED';
}

function normalize(item: unknown): SyncFailureResolution | null {
  if (!item || typeof item !== 'object') return null;
  const o = item as Record<string, unknown>;
  const failureId = typeof o.failureId === 'string' ? o.failureId.trim() : '';
  const entityType = typeof o.entityType === 'string' ? o.entityType : '';
  const entityId = typeof o.entityId === 'string' ? o.entityId : '';
  if (!failureId || !entityType || !entityId) return null;
  if (!isResolutionAction(o.action)) return null;
  if (!isResolutionStatus(o.status)) return null;
  return {
    failureId,
    entityType,
    entityId,
    action: o.action,
    status: o.status,
    resolvedAt: typeof o.resolvedAt === 'string' ? o.resolvedAt : null,
    appliedSaleId: typeof o.appliedSaleId === 'string' ? o.appliedSaleId : null,
  };
}

export async function fetchSyncFailureResolutions(since: string): Promise<SyncFailureResolutionsResponse | null> {
  const url = buildApiPath('/staff/sync-failures/resolutions');
  try {
    const { data } = await api.get<{ data?: unknown; updatedAt?: unknown }>(url, {
      params: { since },
    });
    const list = Array.isArray(data?.data) ? data.data : [];
    const items: SyncFailureResolution[] = [];
    for (const raw of list) {
      const item = normalize(raw);
      if (item) items.push(item);
    }
    const updatedAt = typeof data?.updatedAt === 'string' ? data.updatedAt : since;
    return { data: items, updatedAt };
  } catch {
    return null;
  }
}

import { settingsRepository } from '@/db/settingsRepository';

export type StoredCategory = {
  id: string;
  name?: string;
  description?: string | null;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

function asCategoryList(raw: unknown): StoredCategory[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((c): c is StoredCategory => {
    return Boolean(c && typeof c === 'object' && typeof (c as StoredCategory).id === 'string');
  });
}

export async function readCategories(): Promise<StoredCategory[]> {
  return asCategoryList(await settingsRepository.getJson(settingsRepository.keys.categories));
}

/**
 * Upsert categories by id and remove deleted ids. Persists to settings JSON cache.
 */
export async function mergeCategories(input: {
  upserts?: StoredCategory[] | unknown[] | null;
  deletedIds?: string[] | null;
}): Promise<void> {
  const deleted = new Set((input.deletedIds ?? []).filter((id) => typeof id === 'string' && id.length > 0));
  const byId = new Map<string, StoredCategory>();

  for (const c of await readCategories()) {
    if (!deleted.has(c.id)) byId.set(c.id, c);
  }

  for (const raw of input.upserts ?? []) {
    if (!raw || typeof raw !== 'object') continue;
    const c = raw as StoredCategory;
    if (typeof c.id !== 'string' || !c.id) continue;
    if (deleted.has(c.id)) continue;
    byId.set(c.id, { ...byId.get(c.id), ...c, id: c.id });
  }

  await settingsRepository.setJson(settingsRepository.keys.categories, Array.from(byId.values()));
}

export async function replaceCategories(list: unknown[] | null | undefined): Promise<void> {
  await settingsRepository.setJson(settingsRepository.keys.categories, asCategoryList(list));
}

import { db } from '@/db/schema';

const SETTINGS = {
  organization: 'organization',
  initialSyncDone: 'initial_sync_done',
  taxSettings: 'tax_settings',
  categories: 'categories',
} as const;

export const settingsRepository = {
  keys: SETTINGS,

  async get(key: string): Promise<string | null> {
    const row = await db.settings.get(key);
    return row?.value ?? null;
  },

  async set(key: string, value: string): Promise<void> {
    await db.settings.put({ key, value });
  },

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  async setJson(key: string, value: unknown): Promise<void> {
    await this.set(key, JSON.stringify(value));
  },

  async isInitialSyncDone(): Promise<boolean> {
    return (await this.get(SETTINGS.initialSyncDone)) === '1';
  },

  async setInitialSyncDone(done: boolean): Promise<void> {
    await this.set(SETTINGS.initialSyncDone, done ? '1' : '0');
  },
};

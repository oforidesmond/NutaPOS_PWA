import { getStoredAccessToken } from '@/api/client';
import { postStaffBackup } from '@/api/staffBackupApi';
import { db, type PrefRow, type Product, type Sale, type SaleItem, type SettingRow, type SyncQueueRow, type TrialUsage } from '@/db/schema';
import { prefsRepository } from '@/db/prefsRepository';
import { downloadTextFile } from '@/lib/downloadFile';
import { APP_VERSION, getOrCreateInstallationId } from '@/services/deviceFingerprint';

const LOCAL_BACKUP_MAX = 5;

const SECRET_KEYS = new Set([
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'user_profile_json',
  'token',
  'authorization',
]);

export type BackupTables = {
  products: Product[];
  sales: Sale[];
  sale_items: SaleItem[];
  sync_queue: SyncQueueRow[];
  trial_usage: TrialUsage[];
  settings: SettingRow[];
  prefs: PrefRow[];
};

export type BackupFile = {
  format: 'nutapos-staff-backup';
  version: 1;
  created_at: string;
  device_id: string;
  app_version: string;
  tables: BackupTables;
};

export type LocalBackupInfo = {
  name: string;
  createdAt: string;
  size: number;
};

export function isSecretKey(key: string): boolean {
  return SECRET_KEYS.has(key.toLowerCase());
}

export function parseBackupFile(raw: unknown): BackupTables {
  if (!raw || typeof raw !== 'object') throw new Error('Unrecognized backup');
  const record = { ...(raw as Record<string, unknown>) };
  for (const key of Object.keys(record)) {
    if (isSecretKey(key)) delete record[key];
  }
  const tables = record.tables;
  if (!tables || typeof tables !== 'object') throw new Error('Unrecognized backup');
  const source = { ...(tables as Record<string, unknown>) };
  delete source.secrets;
  return {
    products: asRows<Product>(source.products),
    sales: asRows<Sale>(source.sales),
    sale_items: asRows<SaleItem>(source.sale_items),
    sync_queue: asRows<SyncQueueRow>(source.sync_queue),
    trial_usage: asRows<TrialUsage>(source.trial_usage),
    settings: asRows<SettingRow>(source.settings),
    prefs: cleanPrefs(source.prefs),
  };
}

function asRows<T>(value: unknown): T[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error('Unrecognized backup');
  return value as T[];
}

function cleanPrefs(value: unknown): PrefRow[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error('Unrecognized backup');
  const prefs: PrefRow[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const key = (row as PrefRow).key;
    if (typeof key !== 'string' || isSecretKey(key)) continue;
    prefs.push({ key, value: stripSecretFields((row as PrefRow).value) });
  }
  return prefs;
}

function stripSecretFields(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const copy: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (!isSecretKey(key)) copy[key] = nested;
  }
  return copy;
}

function backupFileName(deviceId: string, createdAt: string): string {
  const ts = createdAt.replace(/:/g, '-').split('.')[0];
  return `backup_${deviceId}_${ts}.json`;
}

async function readTables(): Promise<BackupTables> {
  const [products, sales, saleItems, syncQueue, trialUsage, settings, prefs] = await Promise.all([
    db.products.toArray(),
    db.sales.toArray(),
    db.sale_items.toArray(),
    db.sync_queue.toArray(),
    db.trial_usage.toArray(),
    db.settings.toArray(),
    db.prefs.toArray(),
  ]);
  return parseBackupFile({
    tables: {
      products,
      sales,
      sale_items: saleItems,
      sync_queue: syncQueue,
      trial_usage: trialUsage,
      settings,
      prefs,
    },
  });
}

let createTask: Promise<string> | null = null;

export const databaseBackupService = {
  async createBackup(options?: { download?: boolean }): Promise<string> {
    if (createTask) return createTask;
    createTask = this.writeBackup(options?.download !== false).finally(() => {
      createTask = null;
    });
    return createTask;
  },

  async writeBackup(download: boolean): Promise<string> {
    const deviceId = await getOrCreateInstallationId().catch(() => 'unknown');
    const createdAt = new Date().toISOString();
    const fileName = backupFileName(deviceId || 'unknown', createdAt);
    const payload: BackupFile = {
      format: 'nutapos-staff-backup',
      version: 1,
      created_at: createdAt,
      device_id: deviceId || 'unknown',
      app_version: APP_VERSION,
      tables: await readTables(),
    };
    await db.local_backups.put({ file_name: fileName, created_at: createdAt, payload });
    await trimBackups();
    await prefsRepository.set(prefsRepository.keys.lastBackupDate, new Date().toDateString());

    const json = JSON.stringify(payload);
    if (download) downloadTextFile(fileName, json, 'application/json');

    const blob = new Blob([json], { type: 'application/json' });
    void postStaffBackup(blob, fileName, {
      device_id: deviceId || 'unknown',
      app_version: APP_VERSION,
      build_number: 'pwa',
    }).catch(() => {
      // Cloud backup is best-effort. The local file is the one that can be restored offline.
    });
    return fileName;
  },

  async listLocalBackups(): Promise<LocalBackupInfo[]> {
    const rows = await db.local_backups.orderBy('created_at').reverse().toArray();
    return rows.map((row) => ({
      name: row.file_name,
      createdAt: row.created_at,
      size: new TextEncoder().encode(JSON.stringify(row.payload)).length,
    }));
  },

  async deleteLocalBackup(fileName: string): Promise<void> {
    await db.local_backups.delete(fileName);
  },

  async restoreFromBackup(fileName: string): Promise<void> {
    const row = await db.local_backups.get(fileName);
    if (!row) throw new Error('Backup file not found');
    await replaceLocalTables(parseBackupFile(row.payload));
  },

  async restoreFromFileContents(text: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      throw new Error('Unrecognized backup');
    }
    await replaceLocalTables(parseBackupFile(parsed));
  },

  async shouldRunDailyBackup(): Promise<boolean> {
    const last = await prefsRepository.get<string>(prefsRepository.keys.lastBackupDate);
    return last !== new Date().toDateString();
  },

  async runDailyBackupIfDue(): Promise<void> {
    if (!(await getStoredAccessToken())) return;
    if (!(await this.shouldRunDailyBackup())) return;
    try {
      await this.createBackup({ download: false });
    } catch {
      // A failed daily backup does not fail login.
    }
  },

  async getLastBackupDateLabel(): Promise<string> {
    const last = await prefsRepository.get<string>(prefsRepository.keys.lastBackupDate);
    return typeof last === 'string' && last ? last : '-';
  },
};

async function trimBackups(): Promise<void> {
  const rows = await db.local_backups.orderBy('created_at').reverse().toArray();
  const extra = rows.slice(LOCAL_BACKUP_MAX);
  if (extra.length === 0) return;
  await db.local_backups.bulkDelete(extra.map((row) => row.file_name));
}

async function replaceLocalTables(tables: BackupTables): Promise<void> {
  await db.transaction(
    'rw',
    [db.products, db.sales, db.sale_items, db.sync_queue, db.trial_usage, db.settings, db.prefs],
    async () => {
      await db.products.clear();
      await db.sales.clear();
      await db.sale_items.clear();
      await db.sync_queue.clear();
      await db.trial_usage.clear();
      await db.settings.clear();
      await db.prefs.clear();
      if (tables.products.length) await db.products.bulkAdd(tables.products);
      if (tables.sales.length) await db.sales.bulkAdd(tables.sales);
      if (tables.sale_items.length) await db.sale_items.bulkAdd(tables.sale_items);
      if (tables.sync_queue.length) await db.sync_queue.bulkAdd(tables.sync_queue);
      if (tables.trial_usage.length) await db.trial_usage.bulkAdd(tables.trial_usage);
      if (tables.settings.length) await db.settings.bulkAdd(tables.settings);
      if (tables.prefs.length) await db.prefs.bulkAdd(tables.prefs);
    },
  );
}

export function formatBackupSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

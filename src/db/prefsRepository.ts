import { db } from '@/db/schema';

/**
 * Replaces the mobile MMKV store id `nutapos-staff`.
 * Key names follow the PWA preamble. The mobile app uses different names for
 * a few of them: `trial_warning_40`, `last_time_validation_at`, and
 * `low_storage_critical_alert_day`.
 */
export const PREF_KEYS = {
  lastSyncTime: 'last_sync_time',
  lastMasterDataPull: 'last_master_data_pull',
  lastSyncFailureResolutionPull: 'last_sync_failure_resolution_pull',
  defaultPrinter: 'default_printer',
  lastBackupDate: 'last_backup_date',
  trialWarningShown: 'trial_warning_shown',
  lastTimeCheck: 'last_time_check',
  lowStorageDay: 'low_storage_day',
  installationId: 'installation_id',
  deviceBindingCompleted: 'device_binding_completed',
} as const;

export type DefaultPrinter = {
  transport: 'usb' | 'ble' | 'browser';
  id: string;
};

export const prefsRepository = {
  keys: PREF_KEYS,

  async get<T = unknown>(key: string): Promise<T | null> {
    const row = await db.prefs.get(key);
    if (!row) return null;
    return row.value as T;
  },

  async set(key: string, value: unknown): Promise<void> {
    await db.prefs.put({ key, value });
  },

  async delete(key: string): Promise<void> {
    await db.prefs.delete(key);
  },
};

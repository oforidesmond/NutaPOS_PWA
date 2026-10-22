import { postStaffDatabaseWarning } from '@/api/staffWarningsApi';
import { db } from '@/db/schema';

const REQUIRED_TABLES = ['products', 'sales', 'sale_items', 'sync_queue', 'trial_usage'] as const;

export type IntegrityReport = {
  healthy: boolean;
  errors: string[];
  /** Always false. IndexedDB has no SQLite `PRAGMA integrity_check`. */
  pragmaCorrupt: boolean;
};

/**
 * The mobile service compares `trial_usage.sales_count` whenever the row exists,
 * including after the organization leaves the trial plan.
 */
export const databaseIntegrityService = {
  async checkFull(): Promise<IntegrityReport> {
    const errors: string[] = [];
    const names = new Set(db.tables.map((table) => table.name));
    for (const table of REQUIRED_TABLES) {
      if (!names.has(table)) errors.push(`Missing table: ${table}`);
    }

    const saleIds = new Set(await db.sales.toCollection().primaryKeys());
    const items = await db.sale_items.toArray();
    let orphanCount = 0;
    for (const item of items) {
      if (!saleIds.has(item.sale_id)) orphanCount += 1;
    }
    if (orphanCount > 0) errors.push(`${orphanCount} orphaned sale item(s) found`);

    let trial = await db.trial_usage.get(1);
    if (!trial) {
      try {
        await db.trial_usage.put({
          id: 1,
          sales_count: 0,
          trial_limit: 50,
          device_fingerprint_hash: 'pending_initial_sync',
          last_updated: new Date().toISOString(),
        });
        trial = await db.trial_usage.get(1);
      } catch {
        // Recorded below when the row is still missing.
      }
    }

    const actual = await db.sales.filter((sale) => sale.is_return === 0).count();
    if (trial) {
      const diff = Math.abs(trial.sales_count - actual);
      if (diff > 5) {
        await db.trial_usage.update(1, {
          sales_count: actual,
          last_updated: new Date().toISOString(),
        });
        errors.push(`Trial count mismatch (auto-fixed: set to ${actual})`);
      }
    } else {
      errors.push('trial_usage row missing');
    }

    return { healthy: errors.length === 0, errors, pragmaCorrupt: false };
  },

  async notifyBackend(report: IntegrityReport): Promise<void> {
    await postStaffDatabaseWarning({ healthy: report.healthy, errors: report.errors });
  },
};

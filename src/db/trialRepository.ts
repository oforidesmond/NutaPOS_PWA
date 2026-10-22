import { db, type TrialUsage } from '@/db/schema';

/**
 * Matches mobile `trialRepository.ensureRow`.
 * A new row starts at `sales_count` 0. An existing count is kept.
 * The organization payload's sales count is stored on the organization JSON,
 * not copied onto this row. The mobile seeder does the same.
 */
export const trialRepository = {
  async get(): Promise<TrialUsage | undefined> {
    return db.trial_usage.get(1);
  },

  async ensureRow(deviceFingerprintHash: string, trialLimit: number): Promise<void> {
    const existing = await this.get();
    const now = new Date().toISOString();
    if (!existing) {
      await db.trial_usage.put({
        id: 1,
        sales_count: 0,
        trial_limit: trialLimit,
        device_fingerprint_hash: deviceFingerprintHash,
        last_updated: now,
      });
      return;
    }
    await db.trial_usage.update(1, {
      trial_limit: trialLimit,
      device_fingerprint_hash: deviceFingerprintHash,
      last_updated: now,
    });
  },

  /** Server trial count. Does not run inside the checkout transaction. */
  async setSalesCountFromServer(salesCount: number): Promise<void> {
    const existing = await this.get();
    if (!existing) return;
    await db.trial_usage.update(1, {
      sales_count: salesCount,
      last_updated: new Date().toISOString(),
    });
  },
};

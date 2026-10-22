import { postStaffDeviceWarning } from '@/api/staffWarningsApi';
import { showToast } from '@/components/toast';
import { prefsRepository } from '@/db/prefsRepository';

const CRITICAL_MB = 100;
const WARNING_MB = 500;

export async function readFreeStorageMb(): Promise<number | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  try {
    const estimate = await navigator.storage.estimate();
    if (estimate.quota == null) return null;
    const usage = estimate.usage ?? 0;
    return (estimate.quota - usage) / (1024 * 1024);
  } catch {
    return null;
  }
}

export async function warnIfLowStorage(): Promise<void> {
  const freeMb = await readFreeStorageMb();
  if (freeMb == null) return;

  if (freeMb < CRITICAL_MB) {
    const today = new Date().toDateString();
    const last = await prefsRepository.get<string>(prefsRepository.keys.lowStorageDay);
    if (last !== today) {
      await prefsRepository.set(prefsRepository.keys.lowStorageDay, today);
      showToast(
        'Critical: low storage',
        `About ${Math.round(freeMb)} MB free. The app may crash or fail to sync. Free space on this device.`,
      );
    }
    if (typeof navigator === 'undefined' || navigator.onLine) {
      void postStaffDeviceWarning({
        type: 'low_storage',
        free_space_mb: freeMb,
        threshold_mb: CRITICAL_MB,
        level: 'critical',
      });
    }
    return;
  }

  if (freeMb < WARNING_MB) {
    showToast('Low storage', `${Math.round(freeMb)} MB free. Consider freeing space before long shifts.`);
    if (typeof navigator === 'undefined' || navigator.onLine) {
      void postStaffDeviceWarning({
        type: 'low_storage',
        free_space_mb: freeMb,
        threshold_mb: WARNING_MB,
        level: 'warning',
      });
    }
  }
}

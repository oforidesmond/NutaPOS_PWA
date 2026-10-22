import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { databaseBackupService } from '@/services/databaseBackupService';
import { databaseIntegrityService } from '@/services/databaseIntegrityService';
import { warnIfLowStorage } from '@/services/storageWarningService';
import { maybeDailyMidnightCheck, warnDeviceTimeIfNeeded } from '@/services/timeValidationService';

/**
 * Clock, storage, integrity report, and the daily local backup.
 * Sync and master data stay on SyncLifecycle. None of these calls block checkout.
 */
export function PostAuthEffects() {
  const { user, initialSyncComplete } = useAuth();
  const userId = user?.userId ?? null;
  const needsPasswordChange = user?.needsPasswordChange ?? false;

  useEffect(() => {
    if (!userId || needsPasswordChange || !initialSyncComplete) return;

    void warnDeviceTimeIfNeeded(userId);
    void maybeDailyMidnightCheck(userId);
    void databaseBackupService.runDailyBackupIfDue();
    void databaseIntegrityService.checkFull().then((report) => databaseIntegrityService.notifyBackend(report));
    void warnIfLowStorage();

    const onVisible = () => {
      if (document.visibilityState === 'visible') void warnIfLowStorage();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [userId, needsPasswordChange, initialSyncComplete]);

  return null;
}

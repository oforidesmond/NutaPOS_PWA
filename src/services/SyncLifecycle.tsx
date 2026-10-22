import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { isSaleSyncMessage } from '@/services/backgroundSync';
import { pullMasterData } from '@/services/masterDataPull';
import { syncWorker } from '@/services/syncWorker';

const MASTER_DATA_INTERVAL_MS = 30 * 60 * 1000;

function runSyncCycle(): void {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  void syncWorker.processQueue();
  void pullMasterData();
}

/**
 * Uploads the queue and refreshes master data while a signed-in session is open.
 * The worker also pulls admin resolutions before it selects rows.
 */
export function SyncLifecycle() {
  const { user, initialSyncComplete } = useAuth();
  const userId = user?.userId ?? null;

  useEffect(() => {
    if (!userId || !initialSyncComplete) return;

    runSyncCycle();

    const onOnline = () => runSyncCycle();
    window.addEventListener('online', onOnline);

    const interval = window.setInterval(() => {
      if (navigator.onLine) runSyncCycle();
    }, MASTER_DATA_INTERVAL_MS);

    const onMessage = (event: MessageEvent) => {
      if (isSaleSyncMessage(event.data)) syncWorker.trigger();
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);

    return () => {
      window.removeEventListener('online', onOnline);
      window.clearInterval(interval);
      navigator.serviceWorker?.removeEventListener('message', onMessage);
    };
  }, [userId, initialSyncComplete]);

  return null;
}

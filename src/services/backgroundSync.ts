const SYNC_TAG = 'nutapos-sync';

type SyncRegistration = ServiceWorkerRegistration & {
  sync?: { register: (tag: string) => Promise<void> };
};

/**
 * Asks the browser to wake an open client when the network returns.
 * The upload itself still runs in the page. This is a no-op where Background Sync is missing.
 */
export async function registerSaleSync(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registration = (await navigator.serviceWorker.ready) as SyncRegistration;
    await registration.sync?.register(SYNC_TAG);
  } catch {
    // Background Sync is optional. The in-app worker still runs.
  }
}

export function isSaleSyncMessage(data: unknown): boolean {
  return Boolean(data && typeof data === 'object' && (data as { type?: string }).type === SYNC_TAG);
}

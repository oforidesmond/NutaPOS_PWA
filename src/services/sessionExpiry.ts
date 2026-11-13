import { clearStoredTokens } from '@/db/secretsRepository';
import { disconnectNotificationsSocket } from '@/services/notificationsSocket';
import { clearUserProfile } from '@/services/userProfileStore';
import { useNotificationStore } from '@/stores/notificationStore';

let expireInFlight: Promise<void> | null = null;

/**
 * Ends a dead online session without wiping local POS data.
 *
 * Clears tokens + profile so the UI returns to login. Keeps products, sales,
 * sync queue, device binding, and initial-sync flags so re-login can resume
 * uploads without a full catalog re-download.
 *
 * Call only when the server has rejected the refresh token (401/403), not on
 * transient network errors — those must leave the offline session intact.
 */
export async function expireDeadSession(): Promise<void> {
  if (expireInFlight) return expireInFlight;
  expireInFlight = (async () => {
    disconnectNotificationsSocket();
    useNotificationStore.getState().reset();
    await clearStoredTokens();
    await clearUserProfile();
  })().finally(() => {
    expireInFlight = null;
  });
  return expireInFlight;
}

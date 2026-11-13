import { refreshAccessToken } from '@/api/client';

/** Proactive refresh before 15m access token expiry (backend-dependent). */
const INTERVAL_MS = 10 * 60 * 1000;

/**
 * Ticks immediately, then every 10 minutes, matching the mobile scheduler.
 * Branch id is updated inside `refreshAccessToken`.
 * A 401/403 from refresh expires the session (see `expireDeadSession`);
 * transient network errors leave tokens so offline selling continues.
 */
export function startProactiveTokenRefresh(): () => void {
  const tick = async () => {
    try {
      await refreshAccessToken();
    } catch {
      // Auth rejection already expired the session; network blips are ignored.
    }
  };
  const id = setInterval(() => void tick(), INTERVAL_MS);
  void tick();
  return () => clearInterval(id);
}

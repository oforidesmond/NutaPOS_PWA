import { refreshAccessToken } from '@/api/client';

/** Proactive refresh before 15m access token expiry (backend-dependent). */
const INTERVAL_MS = 10 * 60 * 1000;

/**
 * Ticks immediately, then every 10 minutes, matching the mobile scheduler.
 * Branch id is updated inside `refreshAccessToken`. The mobile scheduler does
 * not do that step; this phase requires it. Socket reconnect is Phase 6.
 */
export function startProactiveTokenRefresh(): () => void {
  const tick = async () => {
    try {
      await refreshAccessToken();
    } catch {
      // A failed refresh must not clear tokens.
    }
  };
  const id = setInterval(() => void tick(), INTERVAL_MS);
  void tick();
  return () => clearInterval(id);
}

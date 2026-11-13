import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { text } from '@/theme';

/** How often to ask the browser to check for a new service worker while online. */
const UPDATE_CHECK_MS = 30 * 60 * 1000;

/**
 * Shows a sticky banner when a new app build is waiting.
 * Production service worker only — not registered under `vite` / `npm run dev`.
 */
export function PwaUpdateBanner() {
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      registrationRef.current = registration;
    },
    onRegisterError(error) {
      console.warn('[pwa] service worker registration failed', error);
    },
  });

  useEffect(() => {
    const checkForUpdate = () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      void registrationRef.current?.update().catch(() => {
        /* ignore transient network failures */
      });
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    };

    window.addEventListener('online', checkForUpdate);
    document.addEventListener('visibilitychange', onVisible);
    const interval = window.setInterval(checkForUpdate, UPDATE_CHECK_MS);

    return () => {
      window.removeEventListener('online', checkForUpdate);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(interval);
    };
  }, []);

  if (!needRefresh) return null;

  return (
    <div className="pwa-update-banner" role="status" style={text.footnote}>
      <span className="pwa-update-banner__copy">A new version is ready.</span>
      <div className="pwa-update-banner__actions">
        <button
          type="button"
          className="btn btn-primary pwa-update-banner__reload"
          onClick={() => void updateServiceWorker(true)}
        >
          Reload
        </button>
        <button
          type="button"
          className="btn btn-ghost pwa-update-banner__later"
          onClick={() => setNeedRefresh(false)}
        >
          Later
        </button>
      </div>
    </div>
  );
}

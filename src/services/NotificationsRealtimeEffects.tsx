import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  connectNotificationsSocket,
  disconnectNotificationsSocket,
  isNotificationsSocketConnected,
} from '@/services/notificationsSocket';
import { useNotificationStore } from '@/stores/notificationStore';

const POLL_FALLBACK_MS = 60_000;

/**
 * Socket lifecycle and unread-count polling while a staff session exists.
 * The token is passed in the Socket.IO auth payload, never the query string.
 */
export function NotificationsRealtimeEffects() {
  const { user, hydrated } = useAuth();
  const userId = user?.userId ?? null;

  useEffect(() => {
    if (!hydrated || !userId) return;

    void connectNotificationsSocket();
    void useNotificationStore.getState().fetchUnreadCount({ force: true });

    const pollInterval = window.setInterval(() => {
      if (!isNotificationsSocketConnected()) {
        void useNotificationStore.getState().fetchUnreadCount({ force: true });
      }
    }, POLL_FALLBACK_MS);

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (!isNotificationsSocketConnected()) {
        void connectNotificationsSocket();
      }
      void useNotificationStore.getState().fetchUnreadCount({ force: true });
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', onVisible);
      disconnectNotificationsSocket();
    };
  }, [hydrated, userId]);

  return null;
}

import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from '@/db/secretsRepository';
import { getApiBaseUrl } from '@/lib/env';
import { useNotificationStore } from '@/stores/notificationStore';
import type { NotificationCountUpdatedPayload, NotificationRealtimePayload } from '@/types/notifications';

let socket: Socket | null = null;
let countDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let connectAttempted = false;

const COUNT_DEBOUNCE_MS = 400;

function clearCountDebounce(): void {
  if (countDebounceTimer) {
    clearTimeout(countDebounceTimer);
    countDebounceTimer = null;
  }
}

function scheduleUnreadCountRefetch(): void {
  clearCountDebounce();
  countDebounceTimer = setTimeout(() => {
    countDebounceTimer = null;
    void useNotificationStore.getState().fetchUnreadCount({ force: true });
  }, COUNT_DEBOUNCE_MS);
}

function attachListeners(sock: Socket): void {
  sock.on('connect', () => {
    useNotificationStore.getState().setSocketConnected(true);
    useNotificationStore.getState().setSocketDegraded(false);
  });

  sock.on('disconnect', () => {
    useNotificationStore.getState().setSocketConnected(false);
    if (connectAttempted) {
      useNotificationStore.getState().setSocketDegraded(true);
    }
  });

  sock.on('connect_error', () => {
    useNotificationStore.getState().setSocketConnected(false);
    useNotificationStore.getState().setSocketDegraded(true);
  });

  sock.on('notification:new', (payload: NotificationRealtimePayload) => {
    useNotificationStore.getState().upsertFromRealtime(payload);
    scheduleUnreadCountRefetch();
  });

  sock.on('notification:count-updated', (_payload: NotificationCountUpdatedPayload) => {
    scheduleUnreadCountRefetch();
  });
}

/** True once this session has opened a socket. Token refresh reconnects only then. */
export function notificationsSocketWasStarted(): boolean {
  return socket !== null || connectAttempted;
}

export async function connectNotificationsSocket(): Promise<void> {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) return;
  const token = await getAccessToken();
  if (!token) return;

  if (socket?.connected) return;

  disconnectNotificationsSocket();
  connectAttempted = true;

  const url = `${baseUrl.replace(/\/+$/, '')}/notifications`;
  socket = io(url, {
    path: '/socket.io/',
    transports: ['websocket', 'polling'],
    auth: { token },
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30_000,
    randomizationFactor: 0.5,
  });

  attachListeners(socket);
}

export function disconnectNotificationsSocket(): void {
  clearCountDebounce();
  connectAttempted = false;
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  useNotificationStore.getState().setSocketConnected(false);
}

export async function reconnectNotificationsSocketWithFreshToken(): Promise<void> {
  if (!notificationsSocketWasStarted()) return;
  disconnectNotificationsSocket();
  await connectNotificationsSocket();
}

export function isNotificationsSocketConnected(): boolean {
  return Boolean(socket?.connected);
}

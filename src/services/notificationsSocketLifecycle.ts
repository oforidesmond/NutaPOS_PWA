/**
 * Thin bridge so the API client can reconnect the socket without a circular import.
 * Branch id is already updated inside `refreshAccessToken`.
 */
import { reconnectNotificationsSocketWithFreshToken } from '@/services/notificationsSocket';

export function onAccessTokenRefreshed(): void {
  void reconnectNotificationsSocketWithFreshToken();
}

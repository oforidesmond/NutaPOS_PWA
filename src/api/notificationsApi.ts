import { api } from '@/api/client';
import { buildApiPath } from '@/lib/env';
import type {
  NotificationListResponse,
  NotificationMarkReadResponse,
  NotificationsUnreadCountResponse,
} from '@/types/notifications';

export const NOTIFICATIONS_PAGE_SIZE = 20;

export type FetchNotificationsParams = {
  cursor?: string;
  limit?: number;
  unread?: boolean;
};

export async function fetchNotifications(
  params: FetchNotificationsParams = {},
): Promise<NotificationListResponse> {
  const url = buildApiPath('/notifications');
  const { cursor, limit = NOTIFICATIONS_PAGE_SIZE, unread } = params;
  const res = await api.get<NotificationListResponse>(url, {
    params: {
      ...(cursor ? { cursor } : {}),
      limit,
      ...(unread != null ? { unread: unread ? 'true' : 'false' } : {}),
    },
  });
  return res.data ?? { data: [] };
}

export async function fetchUnreadCount(): Promise<NotificationsUnreadCountResponse> {
  const url = buildApiPath('/notifications/unread-count');
  const res = await api.get<NotificationsUnreadCountResponse>(url);
  return res.data ?? { unreadCount: 0, hasCritical: false };
}

export async function markNotificationRead(id: string): Promise<NotificationMarkReadResponse> {
  const url = buildApiPath(`/notifications/${id}/read`);
  const res = await api.patch<NotificationMarkReadResponse>(url);
  return res.data ?? { updated: 0 };
}

import type { NotificationListItem } from '@/types/notifications';

export function mergeNotificationItems(
  existing: NotificationListItem[],
  incoming: NotificationListItem[],
): NotificationListItem[] {
  const map = new Map<string, NotificationListItem>();
  for (const item of existing) {
    map.set(item.id, item);
  }
  for (const item of incoming) {
    map.set(item.id, item);
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

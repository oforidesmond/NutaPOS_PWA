import type { NotificationListItem, NotificationType } from '@/types/notifications';

export type StaffNotificationAction = {
  label: string;
  href: string;
};

const STAFF_ROUTES: Record<string, StaffNotificationAction> = {
  '/scanner': { label: 'Open scanner', href: '/scanner' },
  '/pos': { label: 'Open POS', href: '/pos' },
  '/sales-history': { label: 'View sales history', href: '/sales-history' },
  '/returns': { label: 'Open returns', href: '/returns' },
};

const TYPE_ACTIONS: Partial<Record<NotificationType, StaffNotificationAction>> = {
  EXPIRY_WARNING: STAFF_ROUTES['/scanner'],
  BATCH_EXPIRED: STAFF_ROUTES['/scanner'],
  LOW_STOCK: STAFF_ROUTES['/pos'],
  REORDER_SUGGESTION: STAFF_ROUTES['/pos'],
  STOCK_VARIANCE_SALE: STAFF_ROUTES['/sales-history'],
  RETURN_PROCESSED: STAFF_ROUTES['/returns'],
  RETURN_REQUESTED: STAFF_ROUTES['/returns'],
};

function isHubOnlyNotification(notification: NotificationListItem): boolean {
  const meta = notification.metadata;
  if (meta && typeof meta === 'object' && (meta as { hub_only?: unknown }).hub_only === true) {
    return true;
  }
  const url = notification.actionUrl?.trim();
  if (!url) return false;
  return (
    url.startsWith('/sales/') ||
    url.startsWith('/products/') ||
    url.startsWith('/branches/') ||
    url.startsWith('/audit') ||
    url.startsWith('/reports')
  );
}

/**
 * Maps server notifications to in-app routes staff can open.
 * Hub-only `actionUrl` values are ignored. The server `actionLabel` is never the button label.
 */
export function resolveStaffNotificationAction(
  notification: NotificationListItem,
): StaffNotificationAction | null {
  if (isHubOnlyNotification(notification)) {
    return TYPE_ACTIONS[notification.type] ?? null;
  }

  const byType = TYPE_ACTIONS[notification.type];
  if (byType) return byType;

  const url = notification.actionUrl?.trim();
  if (!url) return null;
  if (url in STAFF_ROUTES) return STAFF_ROUTES[url];
  if (url === '/scanner' || url === '/pos' || url === '/returns' || url === '/sales-history') {
    return STAFF_ROUTES[url];
  }

  return null;
}

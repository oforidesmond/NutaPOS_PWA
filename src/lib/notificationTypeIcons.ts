import { colors } from '@/theme/colors';
import type { NotificationType } from '@/types/notifications';

/** Critical unread types per NOTIFICATIONS_REALTIME.md §2.5 */
export const CRITICAL_NOTIFICATION_TYPES = new Set<NotificationType>([
  'SYSTEM_ALERT',
  'PLAN_UPGRADE_REQUIRED',
  'PAYMENT_FAILED',
  'ACCOUNT_SUSPENDED',
  'DATA_BREACH_NOTICE',
  'SECURITY_ALERT',
  'SUSPICIOUS_ACTIVITY',
  'DEVICE_UNAUTHORIZED',
  'BACKUP_FAILED',
  'USAGE_LIMIT_REACHED',
  'SERVICE_MAINTENANCE',
]);

export function isCriticalNotificationType(type: NotificationType): boolean {
  return CRITICAL_NOTIFICATION_TYPES.has(type);
}

export function notificationAccentColor(type: NotificationType): string {
  return isCriticalNotificationType(type) ? colors.error : colors.brandBlue;
}

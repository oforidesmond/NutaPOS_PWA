/** Mirror of Prisma `NotificationType` - keep in sync with backend schema. */
export type NotificationType =
  | 'TEMPORARY_ITEM_SOLD'
  | 'LOW_STOCK'
  | 'EXPIRY_WARNING'
  | 'BATCH_EXPIRED'
  | 'REORDER_SUGGESTION'
  | 'STOCKTAKE_OVERDUE'
  | 'STOCK_VARIANCE_SALE'
  | 'RETURN_REQUESTED'
  | 'RETURN_PROCESSED'
  | 'REFUND_PROCESSED'
  | 'DISCOUNT_ALERT'
  | 'HIGH_VALUE_SALE'
  | 'STAFF_TIME_WARNING'
  | 'STAFF_ROLE_CHANGED'
  | 'SUSPICIOUS_ACTIVITY'
  | 'SECURITY_ALERT'
  | 'DEVICE_UNAUTHORIZED'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_METHOD_EXPIRING'
  | 'SUBSCRIPTION_RENEWED'
  | 'INVOICE_READY'
  | 'TRIAL_LIMIT_WARNING'
  | 'PLAN_UPGRADE_REQUIRED'
  | 'USAGE_LIMIT_REACHED'
  | 'ACCOUNT_SUSPENDED'
  | 'ACCOUNT_REACTIVATED'
  | 'SERVICE_MAINTENANCE'
  | 'FEATURE_ENABLED'
  | 'FEATURE_DISABLED'
  | 'SYSTEM_ALERT'
  | 'BACKUP_FAILED'
  | 'DATA_EXPORT_READY'
  | 'DATA_BREACH_NOTICE'
  | 'COMPLIANCE_UPDATE'
  | 'TAX_RATE_CHANGED'
  | 'MILESTONE_ACHIEVED'
  | 'DAILY_SALES_SUMMARY'
  | 'RECOMMENDATION_AVAILABLE'
  | 'TRAINING_AVAILABLE'
  | 'SHIFT_SCHEDULE'
  | 'POLICY_UPDATE'
  | 'STORE_ANNOUNCEMENT'
  | 'OWNER_MESSAGE'
  | 'TRAINING_REMINDER'
  | 'PERFORMANCE_FEEDBACK'
  | 'OTHER';

export interface NotificationMetadataHubManual {
  sender?: {
    userId: string;
    displayName: string;
    role: string;
  };
  source: 'hub_manual';
  sentAt: string;
  [key: string]: unknown;
}

export interface NotificationListItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  actionUrl: string | null;
  actionLabel: string | null;
  aggregateCount: number;
  metadata: unknown;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  data: NotificationListItem[];
  nextCursor?: string;
}

export interface NotificationsUnreadCountResponse {
  unreadCount: number;
  unreadByType?: Partial<Record<NotificationType, number>>;
  hasCritical: boolean;
}

export interface NotificationMarkReadResponse {
  updated: number;
}

export interface NotificationRealtimePayload {
  id: string;
  organizationId: string;
  userId: string | null;
  type: NotificationType;
  title: string;
  message: string;
  actionUrl: string | null;
  actionLabel: string | null;
  aggregateCount: number;
  createdAt: string;
  senderName?: string | null;
}

export interface NotificationCountUpdatedPayload {
  organizationId: string;
}

export function isHubManualMetadata(metadata: unknown): metadata is NotificationMetadataHubManual {
  if (!metadata || typeof metadata !== 'object') return false;
  const record = metadata as Record<string, unknown>;
  return record.source === 'hub_manual';
}

export function realtimePayloadToListItem(payload: NotificationRealtimePayload): NotificationListItem {
  const metadata =
    payload.senderName != null && payload.senderName !== ''
      ? {
          source: 'hub_manual' as const,
          sentAt: payload.createdAt,
          sender: {
            userId: '',
            displayName: payload.senderName,
            role: '',
          },
        }
      : {};
  return {
    id: payload.id,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    relatedEntityType: null,
    relatedEntityId: null,
    actionUrl: payload.actionUrl,
    actionLabel: payload.actionLabel,
    aggregateCount: payload.aggregateCount,
    metadata,
    isRead: false,
    readAt: null,
    createdAt: payload.createdAt,
  };
}

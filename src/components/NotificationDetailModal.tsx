import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { showToast } from '@/components/toast';
import { formatSentRelative } from '@/lib/formatRelativeTime';
import { resolveStaffNotificationAction } from '@/lib/notificationActions';
import { notificationAccentColor } from '@/lib/notificationTypeIcons';
import { formatTypeLabel, getSenderPresentation } from '@/lib/notificationPresentation';
import { useNotificationStore } from '@/stores/notificationStore';
import type { NotificationListItem } from '@/types/notifications';
import { text } from '@/theme';

type Props = {
  open: boolean;
  notification: NotificationListItem | null;
  onClose: () => void;
};

export function NotificationDetailModal({ open, notification, onClose }: Props) {
  const navigate = useNavigate();
  const markReadOnOpen = useNotificationStore((state) => state.markReadOnOpen);
  const markedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !notification?.id) return;
    if (markedRef.current === notification.id) return;
    markedRef.current = notification.id;
    if (!notification.isRead) {
      void markReadOnOpen(notification.id).catch(() => {
        showToast('Could not mark as read', 'Please try again later.');
      });
    }
  }, [open, notification?.id, notification?.isRead, markReadOnOpen]);

  useEffect(() => {
    if (!open) markedRef.current = null;
  }, [open]);

  if (!notification) return null;

  const sender = getSenderPresentation(notification);
  const staffAction = resolveStaffNotificationAction(notification);
  const sentLabel = formatSentRelative(hubManualSentAt(notification) ?? notification.createdAt);
  const accent = notificationAccentColor(notification.type);

  return (
    <Sheet open={open} title={notification.title} onClose={onClose}>
      {sender ? (
        <div className="notify-sender-row">
          <span className="account-avatar" aria-hidden="true">
            {sender.initials}
          </span>
          <div>
            <p style={text.headline}>{sender.displayName}</p>
            {sender.roleLabel ? (
              <span className={`role-chip${sender.roleLabel === 'Admin' ? ' role-chip-admin' : ''}`}>
                {sender.roleLabel}
              </span>
            ) : null}
            {sentLabel ? <p className="hint">{sentLabel}</p> : null}
          </div>
        </div>
      ) : sentLabel ? (
        <p className="hint">{sentLabel}</p>
      ) : null}

      <p className="type-chip" style={{ color: accent }}>
        {formatTypeLabel(notification.type)}
      </p>
      <h2 style={text.title2}>{notification.title}</h2>
      <p style={text.body}>{notification.message}</p>
      {notification.aggregateCount > 1 ? (
        <p className="hint">{notification.aggregateCount} related updates combined</p>
      ) : null}
      {notification.relatedEntityType && notification.relatedEntityId && !staffAction ? (
        <p className="hint">
          Related: {notification.relatedEntityType} · {notification.relatedEntityId.slice(0, 8)}…
        </p>
      ) : null}
      {staffAction ? (
        <Button
          title={staffAction.label}
          onClick={() => {
            onClose();
            navigate(staffAction.href);
          }}
        />
      ) : null}
    </Sheet>
  );
}

function hubManualSentAt(notification: NotificationListItem): string | null {
  const metadata = notification.metadata;
  if (
    metadata &&
    typeof metadata === 'object' &&
    'sentAt' in metadata &&
    typeof (metadata as { sentAt: unknown }).sentAt === 'string'
  ) {
    return (metadata as { sentAt: string }).sentAt;
  }
  return null;
}

import { formatRelativeTime } from '@/lib/formatRelativeTime';
import { notificationAccentColor } from '@/lib/notificationTypeIcons';
import { getSenderPresentation } from '@/lib/notificationPresentation';
import type { NotificationListItem } from '@/types/notifications';

type Props = {
  item: NotificationListItem;
  onPress: (id: string) => void;
};

export function NotificationListItem({ item, onPress }: Props) {
  const sender = getSenderPresentation(item);
  const accent = notificationAccentColor(item.type);

  return (
    <button
      type="button"
      className="notify-card"
      onClick={() => onPress(item.id)}
      aria-label={`${item.isRead ? '' : 'Unread, '}${item.title}. ${item.message}`}
    >
      <span className="notify-mark" style={{ background: `${accent}14`, color: accent }} aria-hidden="true" />
      <span className="notify-copy">
        <span className="notify-title-row">
          {!item.isRead ? <span className="notify-unread" aria-hidden="true" /> : null}
          {sender ? (
            <span className="notify-sender">
              {sender.displayName}
              {sender.roleLabel ? <span className="notify-role"> · {sender.roleLabel}</span> : null}
            </span>
          ) : null}
        </span>
        <span className={`notify-title${item.isRead ? '' : ' notify-title-unread'}`}>{item.title}</span>
        <span className="notify-message">{item.message}</span>
        <span className="notify-time">{formatRelativeTime(item.createdAt)}</span>
      </span>
    </button>
  );
}

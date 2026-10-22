type Props = {
  unreadCount: number;
  hasCritical: boolean;
  loading?: boolean;
  onPress: () => void;
};

function formatBadgeCount(count: number): string {
  if (count > 99) return '99+';
  return String(count);
}

export function NotificationBadge({ unreadCount, hasCritical, loading = false, onPress }: Props) {
  const showBadge = unreadCount > 0;
  const a11yLabel =
    unreadCount > 0
      ? `Notifications, ${unreadCount} unread${hasCritical ? ', includes critical' : ''}`
      : 'Notifications';

  return (
    <button type="button" className="icon-button notify-bell" onClick={onPress} aria-label={a11yLabel}>
      <BellIcon filled={showBadge} />
      {loading && !showBadge ? <span className="notify-loading" aria-hidden="true" /> : null}
      {showBadge ? (
        <span className={`count-badge${hasCritical ? ' count-badge-critical' : ''}`}>
          {formatBadgeCount(unreadCount)}
        </span>
      ) : null}
    </button>
  );
}

function BellIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6 9a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        fill={filled ? 'currentColor' : 'none'}
      />
      <path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

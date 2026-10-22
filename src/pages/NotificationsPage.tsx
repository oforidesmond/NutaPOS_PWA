import { useEffect, useMemo, useRef } from 'react';
import { GlassHeader } from '@/components/GlassHeader';
import { NotificationDetailModal } from '@/components/NotificationDetailModal';
import { NotificationListItem } from '@/components/NotificationListItem';
import { Screen } from '@/components/Screen';
import { useNotificationStore } from '@/stores/notificationStore';
import { text } from '@/theme';

export function NotificationsPage() {
  const items = useNotificationStore((state) => state.items);
  const listLoading = useNotificationStore((state) => state.listLoading);
  const listRefreshing = useNotificationStore((state) => state.listRefreshing);
  const listLoadingMore = useNotificationStore((state) => state.listLoadingMore);
  const nextCursor = useNotificationStore((state) => state.nextCursor);
  const selectedId = useNotificationStore((state) => state.selectedId);
  const socketDegraded = useNotificationStore((state) => state.socketDegraded);
  const fetchNotifications = useNotificationStore((state) => state.fetchNotifications);
  const fetchMoreNotifications = useNotificationStore((state) => state.fetchMoreNotifications);
  const fetchUnreadCount = useNotificationStore((state) => state.fetchUnreadCount);
  const setSelectedId = useNotificationStore((state) => state.setSelectedId);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);

  useEffect(() => {
    void fetchNotifications();
    void fetchUnreadCount();
  }, [fetchNotifications, fetchUnreadCount]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !nextCursor) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void fetchMoreNotifications();
        }
      },
      { rootMargin: '30% 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [nextCursor, fetchMoreNotifications, items.length]);

  const refresh = () => {
    void fetchNotifications({ refresh: true });
    void fetchUnreadCount({ force: true });
  };

  return (
    <Screen
      header={
        <GlassHeader
          title="Notifications"
          backTo="/pos"
          trailing={
            <button type="button" className="header-action" onClick={refresh} disabled={listRefreshing}>
              {listRefreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          }
        />
      }
    >
      {socketDegraded ? <p className="notice-banner">Live updates unavailable</p> : null}
      {listLoading && items.length === 0 ? (
        <div className="stack" aria-hidden="true">
          <div className="skeleton-block" />
          <div className="skeleton-block" />
          <div className="skeleton-block" />
          <div className="skeleton-block" />
        </div>
      ) : items.length === 0 ? (
        <div className="history-empty">
          <p style={text.headline}>No notifications yet</p>
          <p style={text.callout}>You'll see updates here</p>
        </div>
      ) : (
        <div className="stack">
          {items.map((item) => (
            <NotificationListItem key={item.id} item={item} onPress={setSelectedId} />
          ))}
          {nextCursor ? <div ref={sentinelRef} className="list-sentinel" /> : null}
          {listLoadingMore ? <p className="hint">Loading more…</p> : null}
        </div>
      )}
      <NotificationDetailModal open={selectedId != null} notification={selected} onClose={() => setSelectedId(null)} />
    </Screen>
  );
}

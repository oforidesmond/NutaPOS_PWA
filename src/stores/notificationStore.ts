import { create } from 'zustand';
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  NOTIFICATIONS_PAGE_SIZE,
} from '@/api/notificationsApi';
import { isCriticalNotificationType } from '@/lib/notificationTypeIcons';
import { mergeNotificationItems } from '@/stores/notificationMerge';
import type { NotificationListItem, NotificationRealtimePayload } from '@/types/notifications';
import { realtimePayloadToListItem } from '@/types/notifications';

const COUNT_TTL_MS = 20_000;

function recomputeHasCriticalFromItems(items: NotificationListItem[]): boolean {
  return items.some((item) => !item.isRead && isCriticalNotificationType(item.type));
}

type State = {
  unreadCount: number;
  hasCritical: boolean;
  countFetchedAt: number;
  countLoading: boolean;
  items: NotificationListItem[];
  nextCursor: string | undefined;
  listLoading: boolean;
  listRefreshing: boolean;
  listLoadingMore: boolean;
  selectedId: string | null;
  socketConnected: boolean;
  socketDegraded: boolean;
  markReadInFlight: Set<string>;
};

type Actions = {
  fetchUnreadCount: (opts?: { force?: boolean }) => Promise<void>;
  fetchNotifications: (opts?: { refresh?: boolean }) => Promise<void>;
  fetchMoreNotifications: () => Promise<void>;
  upsertFromRealtime: (payload: NotificationRealtimePayload) => void;
  markReadOnOpen: (id: string) => Promise<void>;
  setSelectedId: (id: string | null) => void;
  setSocketConnected: (connected: boolean) => void;
  setSocketDegraded: (degraded: boolean) => void;
  reset: () => void;
};

const initialState: State = {
  unreadCount: 0,
  hasCritical: false,
  countFetchedAt: 0,
  countLoading: false,
  items: [],
  nextCursor: undefined,
  listLoading: false,
  listRefreshing: false,
  listLoadingMore: false,
  selectedId: null,
  socketConnected: false,
  socketDegraded: false,
  markReadInFlight: new Set(),
};

export const useNotificationStore = create<State & Actions>((set, get) => ({
  ...initialState,

  fetchUnreadCount: async (opts = {}) => {
    const { force = false } = opts;
    const { countFetchedAt, countLoading } = get();
    if (countLoading) return;
    if (!force && countFetchedAt > 0 && Date.now() - countFetchedAt < COUNT_TTL_MS) {
      return;
    }
    set({ countLoading: true });
    try {
      const res = await fetchUnreadCount();
      set({
        unreadCount: res.unreadCount,
        hasCritical: res.hasCritical,
        countFetchedAt: Date.now(),
      });
    } catch {
      // Keep the previous count when the request fails.
    } finally {
      set({ countLoading: false });
    }
  },

  fetchNotifications: async (opts = {}) => {
    const { refresh = false } = opts;
    if (refresh) {
      set({ listRefreshing: true });
    } else {
      set({ listLoading: true });
    }
    try {
      const res = await fetchNotifications({ limit: NOTIFICATIONS_PAGE_SIZE });
      set({
        items: res.data ?? [],
        nextCursor: res.nextCursor,
      });
    } catch {
      // Leave the current list in place.
    } finally {
      set({ listLoading: false, listRefreshing: false });
    }
  },

  fetchMoreNotifications: async () => {
    const { nextCursor, listLoadingMore, items } = get();
    if (!nextCursor || listLoadingMore) return;
    set({ listLoadingMore: true });
    try {
      const res = await fetchNotifications({
        cursor: nextCursor,
        limit: NOTIFICATIONS_PAGE_SIZE,
      });
      set({
        items: mergeNotificationItems(items, res.data ?? []),
        nextCursor: res.nextCursor,
      });
    } catch {
      // Keep the pages already loaded.
    } finally {
      set({ listLoadingMore: false });
    }
  },

  upsertFromRealtime: (payload) => {
    const item = realtimePayloadToListItem(payload);
    const { items } = get();
    const existing = items.find((row) => row.id === item.id);
    const wasUnread = existing ? !existing.isRead : true;
    const merged = mergeNotificationItems(items, [
      existing ? { ...existing, ...item, isRead: existing.isRead, readAt: existing.readAt } : item,
    ]);
    const isNewUnread = !existing && !item.isRead;
    set((state) => ({
      items: merged,
      unreadCount: isNewUnread ? state.unreadCount + 1 : state.unreadCount,
      hasCritical:
        state.hasCritical ||
        (isNewUnread && isCriticalNotificationType(item.type)) ||
        recomputeHasCriticalFromItems(merged),
    }));
    if (wasUnread && existing) {
      void get().fetchUnreadCount({ force: true });
    }
  },

  markReadOnOpen: async (id) => {
    const { items, markReadInFlight } = get();
    const item = items.find((row) => row.id === id);
    if (!item || item.isRead) return;
    if (markReadInFlight.has(id)) return;

    const prevItems = items;
    const prevCount = get().unreadCount;
    const prevCritical = get().hasCritical;

    const nextItems = items.map((row) =>
      row.id === id ? { ...row, isRead: true, readAt: new Date().toISOString() } : row,
    );
    const nextInFlight = new Set(markReadInFlight);
    nextInFlight.add(id);

    set({
      items: nextItems,
      unreadCount: Math.max(0, prevCount - 1),
      hasCritical: recomputeHasCriticalFromItems(nextItems),
      markReadInFlight: nextInFlight,
    });

    try {
      await markNotificationRead(id);
      void get().fetchUnreadCount({ force: true });
    } catch (error) {
      set({
        items: prevItems,
        unreadCount: prevCount,
        hasCritical: prevCritical,
      });
      throw error;
    } finally {
      const current = get().markReadInFlight;
      const updated = new Set(current);
      updated.delete(id);
      set({ markReadInFlight: updated });
    }
  },

  setSelectedId: (id) => set({ selectedId: id }),

  setSocketConnected: (connected) =>
    set({
      socketConnected: connected,
      socketDegraded: connected ? false : get().socketDegraded,
    }),

  setSocketDegraded: (degraded) => set({ socketDegraded: degraded }),

  reset: () =>
    set({
      ...initialState,
      markReadInFlight: new Set(),
    }),
}));

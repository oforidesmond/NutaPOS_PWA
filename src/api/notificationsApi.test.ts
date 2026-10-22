import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/api/client', () => ({
  api: { get: vi.fn(), patch: vi.fn() },
}));

vi.mock('@/lib/env', () => ({
  buildApiPath: (p: string) => p,
}));

import { api } from '@/api/client';
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  NOTIFICATIONS_PAGE_SIZE,
} from '@/api/notificationsApi';

const mockGet = api.get as ReturnType<typeof vi.fn>;
const mockPatch = api.patch as ReturnType<typeof vi.fn>;

describe('notificationsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchNotifications calls GET /notifications with limit', async () => {
    mockGet.mockResolvedValue({ data: { data: [], nextCursor: 'c1' } });
    const res = await fetchNotifications();
    expect(mockGet).toHaveBeenCalledWith('/notifications', {
      params: { limit: NOTIFICATIONS_PAGE_SIZE },
    });
    expect(res.nextCursor).toBe('c1');
  });

  it('fetchNotifications passes cursor and unread filter', async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });
    await fetchNotifications({ cursor: 'abc', unread: true });
    expect(mockGet).toHaveBeenCalledWith('/notifications', {
      params: { cursor: 'abc', limit: NOTIFICATIONS_PAGE_SIZE, unread: 'true' },
    });
  });

  it('fetchUnreadCount calls GET /notifications/unread-count', async () => {
    mockGet.mockResolvedValue({
      data: { unreadCount: 3, hasCritical: true },
    });
    const res = await fetchUnreadCount();
    expect(mockGet).toHaveBeenCalledWith('/notifications/unread-count');
    expect(res.unreadCount).toBe(3);
    expect(res.hasCritical).toBe(true);
  });

  it('markNotificationRead PATCHes read endpoint', async () => {
    mockPatch.mockResolvedValue({ data: { updated: 1 } });
    const res = await markNotificationRead('nid-1');
    expect(mockPatch).toHaveBeenCalledWith('/notifications/nid-1/read');
    expect(res.updated).toBe(1);
  });
});

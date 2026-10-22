import { describe, expect, it } from 'vitest';
import { mergeNotificationItems } from '@/stores/notificationMerge';
import type { NotificationListItem } from '@/types/notifications';

function item(id: string, createdAt: string, isRead = false): NotificationListItem {
  return {
    id,
    type: 'OWNER_MESSAGE',
    title: `Title ${id}`,
    message: 'msg',
    relatedEntityType: null,
    relatedEntityId: null,
    actionUrl: null,
    actionLabel: null,
    aggregateCount: 1,
    metadata: {},
    isRead,
    readAt: null,
    createdAt,
  };
}

describe('mergeNotificationItems', () => {
  it('dedupes by id and sorts newest first', () => {
    const a = item('a', '2026-01-01T00:00:00.000Z');
    const b = item('b', '2026-01-03T00:00:00.000Z');
    const aUpdated = { ...a, title: 'Updated A' };
    const merged = mergeNotificationItems([a, b], [aUpdated]);
    expect(merged).toHaveLength(2);
    expect(merged[0]!.id).toBe('b');
    expect(merged[1]!.title).toBe('Updated A');
  });
});

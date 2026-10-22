import { describe, expect, it } from 'vitest';
import type { NotificationListItem } from '@/types/notifications';
import { resolveStaffNotificationAction } from '@/lib/notificationActions';

describe('notificationActions', () => {
  const base: NotificationListItem = {
    id: 'n1',
    type: 'OTHER',
    title: 'Test',
    message: 'Body',
    relatedEntityType: null,
    relatedEntityId: null,
    actionUrl: null,
    actionLabel: null,
    aggregateCount: 1,
    metadata: null,
    isRead: false,
    readAt: null,
    createdAt: '2026-06-01T00:00:00.000Z',
  };

  it('maps expiry warnings to scanner', () => {
    const action = resolveStaffNotificationAction({ ...base, type: 'EXPIRY_WARNING' });
    expect(action).toEqual({ label: 'Open scanner', href: '/scanner' });
  });

  it('maps stock variance sales to sales history', () => {
    const action = resolveStaffNotificationAction({ ...base, type: 'STOCK_VARIANCE_SALE' });
    expect(action).toEqual({ label: 'View sales history', href: '/sales-history' });
  });

  it('ignores hub-only actionUrl but still offers staff route for return processed', () => {
    const action = resolveStaffNotificationAction({
      ...base,
      type: 'RETURN_PROCESSED',
      actionUrl: '/sales/sale-1?returnId=ret-1',
      metadata: { hub_only: true },
    });
    expect(action).toEqual({ label: 'Open returns', href: '/returns' });
  });

  it('returns null for hub-only notifications without a staff mapping', () => {
    const action = resolveStaffNotificationAction({
      ...base,
      type: 'INVOICE_READY',
      actionUrl: '/reports/invoices',
      metadata: { hub_only: true },
    });
    expect(action).toBeNull();
  });
});

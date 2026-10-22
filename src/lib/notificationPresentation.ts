import { isHubManualMetadata, type NotificationListItem } from '@/types/notifications';

export type SenderPresentation = {
  displayName: string;
  roleLabel: string | null;
  initials: string;
};

export function getSenderPresentation(item: NotificationListItem): SenderPresentation | null {
  if (!isHubManualMetadata(item.metadata) || !item.metadata.sender?.displayName) {
    return null;
  }
  const { displayName, role } = item.metadata.sender;
  return {
    displayName,
    roleLabel: formatRoleLabel(role),
    initials: initialsFromName(displayName),
  };
}

export function formatRoleLabel(role: string | undefined): string | null {
  if (!role) return null;
  const upper = role.toUpperCase();
  if (upper === 'ADMIN') return 'Admin';
  if (upper === 'MANAGER') return 'Manager';
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

export function formatTypeLabel(type: string): string {
  return type
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

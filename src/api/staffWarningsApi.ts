import { api, getStoredAccessToken } from '@/api/client';
import { buildApiPath } from '@/lib/env';

export type DeviceWarningPayload = {
  type: 'low_storage';
  free_space_mb: number;
  threshold_mb: number;
  level: 'critical' | 'warning';
};

export async function postStaffDeviceWarning(body: DeviceWarningPayload): Promise<void> {
  if (!(await getStoredAccessToken())) return;
  await api.post(buildApiPath('/staff/device-warning'), body).catch(() => {
    // Device warnings must not block checkout.
  });
}

export type DatabaseWarningPayload = {
  healthy: boolean;
  errors: string[];
};

export async function postStaffDatabaseWarning(body: DatabaseWarningPayload): Promise<void> {
  if (!(await getStoredAccessToken())) return;
  await api.post(buildApiPath('/staff/database-warning'), body).catch(() => {
    // Database warnings must not block checkout.
  });
}
